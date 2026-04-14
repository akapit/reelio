import { execSync } from "child_process";
import { writeFileSync, readFileSync, mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

/**
 * Concatenate multiple MP4 buffers into one via ffmpeg's concat demuxer.
 * All inputs are re-encoded to a common H.264/AAC profile first to avoid
 * failures when source clips (from Kling's per-shot generations) have
 * slightly different codecs / SPS / timebases — demuxer concat requires
 * identical streams, so we normalize first.
 *
 * Returns the merged video as a Buffer. Throws on ffmpeg failure.
 */
export function concatVideos(buffers: Buffer[]): Buffer {
  if (buffers.length === 0) {
    throw new Error("concatVideos: at least one input buffer is required");
  }
  if (buffers.length === 1) return buffers[0];

  const tmpDir = mkdtempSync(join(tmpdir(), "reelio-concat-"));

  try {
    // Normalize each input: same codec, pix_fmt, fps, resolution.
    const normalizedPaths: string[] = [];
    for (let i = 0; i < buffers.length; i++) {
      const inPath = join(tmpDir, `in-${i}.mp4`);
      const outPath = join(tmpDir, `norm-${i}.mp4`);
      writeFileSync(inPath, buffers[i]);
      execSync(
        `ffmpeg -y -i "${inPath}" -c:v libx264 -preset veryfast -crf 20 -pix_fmt yuv420p -r 30 -c:a aac -b:a 128k -ac 2 -ar 48000 -movflags +faststart "${outPath}"`,
        { stdio: "pipe" },
      );
      normalizedPaths.push(outPath);
    }

    // Build concat list file.
    const listPath = join(tmpDir, "list.txt");
    writeFileSync(
      listPath,
      normalizedPaths.map((p) => `file '${p}'`).join("\n"),
    );

    const outputPath = join(tmpDir, "output.mp4");
    execSync(
      `ffmpeg -y -f concat -safe 0 -i "${listPath}" -c copy -movflags +faststart "${outputPath}"`,
      { stdio: "pipe" },
    );

    return readFileSync(outputPath);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}
