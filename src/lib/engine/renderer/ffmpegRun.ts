import { spawn } from "node:child_process";

import { FfmpegError } from "./errors";

const STDERR_TAIL_BYTES = 4096;

function log(event: string, data: Record<string, unknown>): void {
  try {
    console.log(JSON.stringify({ source: "engine.ffmpeg", event, ...data }));
  } catch {
    // swallow — logging must never throw.
  }
}

function truncTail(buffers: Buffer[], maxBytes: number): string {
  if (buffers.length === 0) return "";
  const joined = Buffer.concat(buffers);
  if (joined.byteLength <= maxBytes) return joined.toString("utf8");
  return joined.subarray(joined.byteLength - maxBytes).toString("utf8");
}

function argsPreview(args: string[]): string {
  const preview = args.slice(0, 12).join(" ");
  return args.length > 12 ? `${preview} ...(+${args.length - 12})` : preview;
}

export async function runFfmpeg(
  args: string[],
  timeoutMs = 45_000,
): Promise<{ stdout: string; stderr: string; ms: number }> {
  const started = Date.now();
  log("run.start", { bin: "ffmpeg", argsPreview: argsPreview(args) });

  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let stderrBytes = 0;

    child.stdout?.on("data", (chunk: Buffer) => {
      stdoutChunks.push(chunk);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderrChunks.push(chunk);
      stderrBytes += chunk.byteLength;
      // Keep memory bounded: drop older chunks beyond ~64KB.
      while (stderrBytes > 65_536 && stderrChunks.length > 1) {
        const dropped = stderrChunks.shift();
        if (dropped) stderrBytes -= dropped.byteLength;
      }
    });

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill("SIGKILL");
      } catch {
        // ignore
      }
    }, timeoutMs);

    child.on("error", (err) => {
      clearTimeout(timer);
      const ms = Date.now() - started;
      log("run.error", { ms, message: err.message });
      reject(new FfmpegError(`ffmpeg spawn failed: ${err.message}`));
    });

    child.on("close", (code, signal) => {
      clearTimeout(timer);
      const ms = Date.now() - started;
      const stderr = truncTail(stderrChunks, STDERR_TAIL_BYTES);
      const stdout = Buffer.concat(stdoutChunks).toString("utf8");

      if (timedOut) {
        log("run.timeout", { ms, timeoutMs });
        reject(
          new FfmpegError(
            `ffmpeg timed out after ${timeoutMs}ms`,
            stderr,
          ),
        );
        return;
      }

      if (code !== 0) {
        // Surface the stderr tail both in the structured log AND in the
        // thrown Error message. Previously only `code` reached callers
        // (via err.message), which meant engine_steps.error had no diagnostic
        // — you'd see "ffmpeg exited with code 234" with no hint WHY. The
        // tail is truncated to 4 KB so it stays readable in logs/DB.
        const stderrOneLine = stderr
          .split("\n")
          .filter((l) => l.trim().length > 0)
          .slice(-6)
          .join(" | ")
          .slice(0, 800);
        log("run.failed", {
          ms,
          code,
          signal,
          argsPreview: argsPreview(args),
          stderrTail: stderr,
        });
        reject(
          new FfmpegError(
            `ffmpeg exited with code ${code}${signal ? ` (signal ${signal})` : ""}` +
              (stderrOneLine ? ` — ${stderrOneLine}` : ""),
            stderr,
          ),
        );
        return;
      }

      log("run.done", { ms });
      resolve({ stdout, stderr, ms });
    });
  });
}

type FfprobeStream = {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  duration?: string;
};

type FfprobeFormat = {
  duration?: string;
};

export async function runFfprobe(
  filePath: string,
): Promise<{
  durationSec: number;
  codec: string;
  width: number;
  height: number;
}> {
  const started = Date.now();
  const args = [
    "-v",
    "error",
    "-show_streams",
    "-show_format",
    "-of",
    "json",
    filePath,
  ];
  log("probe.start", { argsPreview: argsPreview(args) });

  return new Promise((resolve, reject) => {
    const child = spawn("ffprobe", args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    child.stdout?.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr?.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

    child.on("error", (err) => {
      log("probe.error", { message: err.message });
      reject(new FfmpegError(`ffprobe spawn failed: ${err.message}`));
    });

    child.on("close", (code) => {
      const ms = Date.now() - started;
      const stderr = truncTail(stderrChunks, STDERR_TAIL_BYTES);

      if (code !== 0) {
        log("probe.failed", { ms, code });
        reject(
          new FfmpegError(`ffprobe exited with code ${code}`, stderr),
        );
        return;
      }

      const raw = Buffer.concat(stdoutChunks).toString("utf8");
      let parsed: { streams?: FfprobeStream[]; format?: FfprobeFormat };
      try {
        parsed = JSON.parse(raw);
      } catch (e) {
        reject(
          new FfmpegError(
            `ffprobe returned invalid JSON: ${(e as Error).message}`,
            stderr,
          ),
        );
        return;
      }

      const streams = parsed.streams ?? [];
      const video = streams.find((s) => s.codec_type === "video");
      if (!video) {
        reject(new FfmpegError("ffprobe: no video stream found", stderr));
        return;
      }

      const durationStr =
        video.duration ?? parsed.format?.duration ?? undefined;
      const durationSec = durationStr ? Number(durationStr) : NaN;
      if (!Number.isFinite(durationSec) || durationSec <= 0) {
        reject(
          new FfmpegError(
            `ffprobe: invalid duration "${durationStr ?? "n/a"}"`,
            stderr,
          ),
        );
        return;
      }

      log("probe.done", { ms });
      resolve({
        durationSec,
        codec: video.codec_name ?? "unknown",
        width: video.width ?? 0,
        height: video.height ?? 0,
      });
    });
  });
}
