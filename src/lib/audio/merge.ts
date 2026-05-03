import { execSync } from "child_process";
import { writeFileSync, readFileSync, mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const MUSIC_FADE_OUT_SECONDS = 1.5;

interface MergeOptions {
  videoBuffer: Buffer;
  voiceoverBuffer?: Buffer;
  musicBuffer?: Buffer;
  musicVolume?: number; // 0-1, default 0.2
  /**
   * Hard cap on output duration (seconds). When set, ffmpeg receives
   * `-t <maxDurationSec>` so a library music track longer than the video
   * doesn't extend the output past the visual end. Leave unset for the
   * historical behavior (ElevenLabs music was sized to the video, so no
   * trim was needed).
   */
  maxDurationSec?: number;
}

function fmtSeconds(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(3);
}

export function mergeAudioWithVideo(options: MergeOptions): Buffer {
  const tmpDir = mkdtempSync(join(tmpdir(), "reelio-merge-"));

  try {
    const videoPath = join(tmpDir, "video.mp4");
    const outputPath = join(tmpDir, "output.mp4");
    writeFileSync(videoPath, options.videoBuffer);

    const inputs: string[] = [`-i "${videoPath}"`];
    const filterParts: string[] = [];
    let audioIndex = 1;

    if (options.voiceoverBuffer) {
      const voPath = join(tmpDir, "voiceover.mp3");
      writeFileSync(voPath, options.voiceoverBuffer);
      inputs.push(`-i "${voPath}"`);
      filterParts.push(`[${audioIndex}:a]volume=1.0[vo]`);
      audioIndex++;
    }

    if (options.musicBuffer) {
      const bgPath = join(tmpDir, "music.mp3");
      writeFileSync(bgPath, options.musicBuffer);
      inputs.push(`-i "${bgPath}"`);
      const vol = options.musicVolume ?? 0.2;
      if (options.maxDurationSec && options.maxDurationSec > 0) {
        const fadeDuration = Math.min(
          MUSIC_FADE_OUT_SECONDS,
          Math.max(0.25, options.maxDurationSec / 4),
        );
        const fadeStart = Math.max(0, options.maxDurationSec - fadeDuration);
        filterParts.push(
          `[${audioIndex}:a]atrim=duration=${fmtSeconds(options.maxDurationSec)},asetpts=PTS-STARTPTS,volume=${vol},afade=t=out:st=${fmtSeconds(fadeStart)}:d=${fmtSeconds(fadeDuration)}[bg]`,
        );
      } else {
        filterParts.push(`[${audioIndex}:a]volume=${vol}[bg]`);
      }
      audioIndex++;
    }

    let filterComplex: string;
    if (options.voiceoverBuffer && options.musicBuffer) {
      // duration=longest so the mix spans the full music bed (generated to
      // match video length). duration=first would end the mix at the voiceover,
      // and combined with -shortest below that truncated the output video to
      // the voiceover's length.
      filterComplex = `${filterParts.join(";")};[vo][bg]amix=inputs=2:duration=longest[a]`;
    } else if (options.voiceoverBuffer) {
      filterComplex = `${filterParts[0].replace("[vo]", "[a]")}`;
    } else if (options.musicBuffer) {
      filterComplex = `${filterParts[0].replace("[bg]", "[a]")}`;
    } else {
      // No audio to merge
      return options.videoBuffer;
    }

    // No -shortest: with -c:v copy the video drives the output length. If the
    // audio track is shorter (e.g. voiceover-only with no music bed), the tail
    // of the video just plays silent — preferable to cutting the video off.
    // `-t` (optional) caps output so a library music track longer than the
    // video doesn't produce a file that extends past the visuals.
    const durationFlag =
      options.maxDurationSec && options.maxDurationSec > 0
        ? ` -t ${options.maxDurationSec}`
        : "";
    const cmd = `ffmpeg -y ${inputs.join(" ")} -filter_complex "${filterComplex}" -map 0:v -map "[a]" -c:v copy -c:a aac${durationFlag} "${outputPath}"`;
    execSync(cmd, { stdio: "pipe" });
    return readFileSync(outputPath);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}
