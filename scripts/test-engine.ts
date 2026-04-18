#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Standalone end-to-end test for the deterministic video engine.
 *
 * Bypasses Next.js, Supabase, and Trigger.dev — calls `runEngineJob`
 * directly so you can iterate on the engine from the CLI.
 *
 * Usage:
 *   npx tsx scripts/test-engine.ts \
 *     --template luxury_30s \
 *     --out /tmp/engine-test.mp4 \
 *     /path/to/img1.jpg /path/to/img2.jpg ... /path/to/img8.jpg
 *
 *   # URLs also work:
 *   npx tsx scripts/test-engine.ts --template fast_15s --out /tmp/e.mp4 \
 *     https://example.com/a.jpg https://example.com/b.jpg ...
 *
 *   # Skip audio (no mp3s needed — generates a silent track):
 *   npx tsx scripts/test-engine.ts --template luxury_30s --out /tmp/e.mp4 --silent-music img1.jpg img2.jpg ...
 *
 * Required env (from .env.local):
 *   ANTHROPIC_API_KEY
 *   GOOGLE_APPLICATION_CREDENTIALS=/abs/path/to/service-account.json
 */

import { config as dotenvConfig } from "dotenv";
import { resolve, isAbsolute, join, basename } from "node:path";
import { mkdtemp, access, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";

// `override: true` — the Claude Code harness (and some shells) inject an
// empty ANTHROPIC_API_KEY into the parent env, which dotenv would otherwise
// leave alone. Overriding lets .env.local always win for CLI runs.
dotenvConfig({ path: resolve(process.cwd(), ".env.local"), override: true });

import { createHash } from "node:crypto";
import { stat as fsStat } from "node:fs/promises";

import { runEngineJob } from "../src/lib/engine";
import {
  TEMPLATE_NAMES,
  type TemplateName,
  type JobResult,
  type JobError,
} from "../src/lib/engine/models";
import { analyzeImages } from "../src/lib/engine/vision/analyzer";

const ASPECT_RATIOS: Record<string, { width: number; height: number }> = {
  "16:9": { width: 1920, height: 1080 },
  "9:16": { width: 1080, height: 1920 },
  "1:1": { width: 1080, height: 1080 },
  "4:3": { width: 1440, height: 1080 },
};

type VideoProviderArg = "piapi" | "kieai";

interface Args {
  template: TemplateName;
  out: string;
  silentMusic: boolean;
  direct: boolean;
  analyzeOnly: boolean;
  minImages?: number;
  allowReuse: boolean;
  cacheDir?: string;
  resume: boolean;
  aspectRatio?: string;
  advisor: boolean;
  videoProvider?: VideoProviderArg;
  images: string[];
}

function parseArgs(argv: string[]): Args {
  const args: Partial<Args> & { images: string[] } = {
    images: [],
    silentMusic: false,
    direct: false,
    analyzeOnly: false,
    allowReuse: false,
    resume: false,
    advisor: true,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--template") {
      const v = argv[++i];
      if (!(TEMPLATE_NAMES as readonly string[]).includes(v)) {
        fail(`invalid --template: ${v}. Valid: ${TEMPLATE_NAMES.join(", ")}`);
      }
      args.template = v as TemplateName;
    } else if (a === "--out") {
      args.out = argv[++i];
    } else if (a === "--silent-music" || a === "--skip-audio") {
      args.silentMusic = true;
    } else if (a === "--direct") {
      args.direct = true;
    } else if (a === "--analyze-only" || a === "--vision-only") {
      args.analyzeOnly = true;
    } else if (a === "--min-images") {
      const n = Number.parseInt(argv[++i], 10);
      if (!Number.isInteger(n) || n < 1) fail("--min-images requires a positive integer");
      args.minImages = n;
    } else if (a === "--allow-reuse") {
      args.allowReuse = true;
    } else if (a === "--cache-dir") {
      args.cacheDir = argv[++i];
    } else if (a === "--resume") {
      args.resume = true;
    } else if (a === "--aspect-ratio" || a === "--ar") {
      const v = argv[++i];
      if (!ASPECT_RATIOS[v]) fail(`invalid --aspect-ratio: ${v}. Valid: ${Object.keys(ASPECT_RATIOS).join(", ")}`);
      args.aspectRatio = v;
    } else if (a === "--verbose" || a === "-v") {
      process.env.ENGINE_VERBOSE = "1";
    } else if (a === "--provider") {
      const v = argv[++i];
      if (v !== "piapi" && v !== "kieai") {
        fail(`invalid --provider: ${v}. Valid: piapi, kieai`);
      }
      args.videoProvider = v;
    } else if (a === "--no-advisor") {
      args.advisor = false;
      process.env.ENGINE_ADVISOR_MODE = "0";
    } else if (a === "--advisor") {
      // Kept as an explicit no-op for backward compatibility with muscle
      // memory / existing shell aliases. Advisor mode is on by default.
      args.advisor = true;
    } else if (a === "--help" || a === "-h") {
      printHelp();
      process.exit(0);
    } else if (a.startsWith("--")) {
      fail(`unknown flag: ${a}`);
    } else {
      args.images.push(a);
    }
  }
  if (args.analyzeOnly) {
    if (args.direct) fail("incompatible flags: --analyze-only cannot be combined with --direct");
    if (args.images.length === 0) fail("at least one image path/URL required");
    // Satisfy the type — template and out are unused in analyze-only mode.
    if (!args.template) args.template = "luxury_30s" as TemplateName;
    if (!args.out) args.out = "";
    return args as Args;
  }
  if (!args.template) fail("missing --template");
  if (!args.out) fail("missing --out");
  if (args.images.length === 0) fail("at least one image path/URL required");
  if (!isAbsolute(args.out)) args.out = resolve(process.cwd(), args.out);
  return args as Args;
}

function printHelp(): void {
  console.log(`Usage: npx tsx scripts/test-engine.ts [options] <image1> <image2> ...

Options:
  --template <name>      One of: ${TEMPLATE_NAMES.join(", ")}
  --out <path>           Output mp4 path (absolute or relative)
  --silent-music         Generate a silent mp3 so you don't need bundled music
  --analyze-only         Run ONLY the vision analyzer + scoring. Prints a per-image report and
  --vision-only          summary to stdout, writes full JSON to tmp/analysis-<timestamp>.json.
                         No prompt generation, no timeline, no FFmpeg. No credits burned.
                         Requires only GOOGLE_APPLICATION_CREDENTIALS.
                         Incompatible with --direct.
  --direct               Skip the Claude orchestrator; drive Vision → Planner → Renderer directly
                         (dev/test only — ANTHROPIC_API_KEY not required)
  --min-images <n>       Only with --direct: override the template's minUsableImages (useful for
                         running with fewer photos than the template nominally requires)
  --allow-reuse          Only with --direct: mark every slot allowReuse=true so the same image
                         can fill multiple slots (useful for 3-image smoke tests)
  --resume               Cache vision results + per-shot renders to a stable dir keyed by inputs.
                         On retry, skip expensive steps whose outputs already exist.
  --cache-dir <path>     Explicit cache dir (alternative to --resume's auto-hashed dir)
  --no-advisor           Disable Anthropic advisor-tool mode (on by default: Sonnet executor
                         with Opus as a server-side advisor tool). Sets ENGINE_ADVISOR_MODE=0
                         and uses the Opus executor instead.
  --provider <name>      Video-generation backend: "piapi" (default) or "kieai".
                         Env fallback: ENGINE_VIDEO_PROVIDER.
  --verbose, -v          Log full orchestrator loop: Claude text, tool inputs, tool results
  -h, --help             Show this message

Env (.env.local):
  ANTHROPIC_API_KEY                  required (unless --direct)
  GOOGLE_APPLICATION_CREDENTIALS     required — path to GCP service-account JSON
  ENGINE_ORCHESTRATOR_MODEL          optional — defaults to claude-opus-4-6
  ENGINE_MUSIC_DIR                   optional — overrides bundled music dir
`);
}

function fail(msg: string): never {
  console.error(`[test-engine] ERROR: ${msg}`);
  process.exit(1);
}

function assertEnv(key: string): void {
  if (!process.env[key]) fail(`missing required env var ${key} (check .env.local)`);
}

function runCmd(cmd: string, args: string[]): Promise<void> {
  return new Promise((res, rej) => {
    const child = spawn(cmd, args, { stdio: "inherit" });
    child.on("error", rej);
    child.on("exit", (code) =>
      code === 0 ? res() : rej(new Error(`${cmd} exited ${code}`)),
    );
  });
}

async function ensureSilentMusicDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "engine-music-"));
  await mkdir(dir, { recursive: true });
  const moods = [
    "luxury_cinematic",
    "family_warm",
    "upbeat_fast",
    "investor_corporate",
    "premium_elegant",
  ];
  // Long enough for any of the 5 templates (max 45s + safety).
  const durationSec = 60;
  // Generate once, then reuse for all moods (ffmpeg -y overwrite).
  const sourcePath = join(dir, moods[0] + ".mp3");
  await runCmd("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    `anullsrc=channel_layout=stereo:sample_rate=44100`,
    "-t",
    String(durationSec),
    "-q:a",
    "9",
    "-acodec",
    "libmp3lame",
    sourcePath,
  ]);
  // Duplicate the silent mp3 for the other 4 moods (copies are free).
  const { copyFile } = await import("node:fs/promises");
  for (const m of moods.slice(1)) {
    await copyFile(sourcePath, join(dir, m + ".mp3"));
  }
  return dir;
}

async function resolveImagePaths(inputs: string[]): Promise<string[]> {
  const resolved: string[] = [];
  for (const p of inputs) {
    if (p.startsWith("http://") || p.startsWith("https://")) {
      resolved.push(p);
      continue;
    }
    const abs = isAbsolute(p) ? p : resolve(process.cwd(), p);
    try {
      await access(abs);
    } catch {
      fail(`image not found: ${abs}`);
    }
    resolved.push(abs);
  }
  return resolved;
}

// ANSI helpers — no extra deps.
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const RED = "\x1b[31m";
const RESET = "\x1b[0m";

function pct(v: number): string {
  return String(Math.round(v * 100)).padStart(3);
}

async function runAnalyzeOnly(imagePaths: string[]): Promise<void> {
  console.log(`[test-engine] --analyze-only: running vision analyzer on ${imagePaths.length} image(s)...\n`);

  let dataset;
  try {
    dataset = await analyzeImages(imagePaths);
  } catch (err) {
    console.error(`[test-engine] analyzer failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  // Per-image report.
  for (const img of dataset.images) {
    const name = basename(img.path);
    const usableFlags: string[] = [];
    if (img.eligibility.asHero) usableFlags.push("hero");
    if (img.eligibility.asWow) usableFlags.push("wow");
    if (img.eligibility.asClosing) usableFlags.push("closing");
    const usable = usableFlags.length > 0;
    const usableStr = usable
      ? `${GREEN}usable: ${usableFlags.join(", ")}${RESET}`
      : `${RED}not usable${RESET}`;

    console.log(`${BOLD}${name}${RESET} ${DIM}—${RESET} ${CYAN}${img.roomType}${RESET} ${DIM}—${RESET} ${usableStr}`);

    // Scores row.
    const s = img.scores;
    console.log(
      `  ${DIM}quality${RESET} ${pct(s.quality)}` +
      `  ${DIM}lighting${RESET} ${pct(s.lighting)}` +
      `  ${DIM}composition${RESET} ${pct(s.composition)}` +
      `  ${DIM}wow${RESET} ${pct(s.wow)}` +
      `  ${DIM}detail${RESET} ${pct(s.detail)}` +
      `  ${DIM}hero${RESET} ${pct(s.hero)}`,
    );

    // Top 3 labels.
    const topLabels = img.visionLabels.slice(0, 3);
    if (topLabels.length > 0) {
      const labelStr = topLabels
        .map((l) => `${l.name} (${(l.confidence * 100).toFixed(0)}%)`)
        .join(", ");
      console.log(`  ${DIM}labels:${RESET} ${labelStr}`);
    }

    // Top 3 colors.
    const topColors = img.dominantColorsHex.slice(0, 3);
    if (topColors.length > 0) {
      console.log(`  ${DIM}colors:${RESET} ${topColors.join("  ")}`);
    }

    // Dims.
    const ar = img.dims.aspectRatio.toFixed(2);
    console.log(`  ${DIM}dims:${RESET} ${img.dims.width}\xd7${img.dims.height} (${ar})`);

    console.log("");
  }

  // Summary.
  const total = dataset.images.length;
  const usableCount = dataset.usableCount;
  const roomCounts: Record<string, number> = {};
  for (const img of dataset.images) {
    roomCounts[img.roomType] = (roomCounts[img.roomType] ?? 0) + 1;
  }
  const roomSummary = Object.entries(roomCounts)
    .map(([r, n]) => `${r}=${n}`)
    .join(", ");

  const MIN_USABLE = 5;
  const recommendation =
    usableCount >= MIN_USABLE
      ? `${GREEN}${usableCount} image${usableCount === 1 ? "" : "s"} usable — ready to generate${RESET}`
      : `${YELLOW}Only ${usableCount} image${usableCount === 1 ? "" : "s"} usable — engine requires ${MIN_USABLE}+${RESET}`;

  console.log(`${BOLD}Summary:${RESET} ${usableCount}/${total} usable  rooms: ${roomSummary}`);
  console.log(recommendation);

  // Write JSON snapshot to tmp/.
  const repoRoot = resolve(process.cwd());
  const tmpDir = join(repoRoot, "tmp");
  try {
    await mkdir(tmpDir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);
    const outPath = join(tmpDir, `analysis-${ts}.json`);
    await writeFile(outPath, JSON.stringify(dataset, null, 2));
    console.log(`\n${DIM}Full dataset written to ${outPath}${RESET}`);
  } catch (err) {
    console.warn(`[test-engine] could not write JSON snapshot: ${err instanceof Error ? err.message : String(err)}`);
  }

  process.exit(0);
}

async function runDirect(
  args: Args,
  imagePaths: string[],
  _startedAt: number,
): Promise<JobResult | JobError> {
  // --direct was a shortcut to skip the old agentic orchestrator. The new
  // orchestrator is imperative (no LLM loop), so --direct is effectively a
  // no-op that just forwards to runEngineJob. Kept for CLI back-compat.
  console.log(`[test-engine] --direct: (now equivalent to default — orchestrator is already imperative)`);
  if (args.minImages !== undefined) {
    console.log(`[test-engine]   --min-images ignored (template override not implemented in new flow)`);
  }
  if (args.allowReuse) {
    console.log(`[test-engine]   --allow-reuse ignored (template override not implemented in new flow)`);
  }
  if (args.aspectRatio) {
    console.log(`[test-engine]   --aspect-ratio ignored (use template selection instead)`);
  }
  return runEngineJob({
    imagePaths,
    templateName: args.template,
    outputPath: args.out,
    ...(args.videoProvider ? { videoProvider: args.videoProvider } : {}),
  });
}

async function computeCacheDir(imagePaths: string[], template: string, arOverride?: string): Promise<string> {
  const hash = createHash("md5");
  hash.update(template);
  if (arOverride) hash.update(`ar:${arOverride}`);
  for (const p of imagePaths) {
    hash.update(p);
    try {
      const s = await fsStat(p);
      hash.update(`${s.size}:${s.mtimeMs}`);
    } catch {
      hash.update("url");
    }
  }
  return join(tmpdir(), "engine-cache", hash.digest("hex").slice(0, 12));
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.analyzeOnly) {
    assertEnv("GOOGLE_APPLICATION_CREDENTIALS");
    const imagePaths = await resolveImagePaths(args.images);
    await runAnalyzeOnly(imagePaths);
    return; // runAnalyzeOnly calls process.exit — this is a safety net.
  }

  if (!args.direct) assertEnv("ANTHROPIC_API_KEY");
  assertEnv("GOOGLE_APPLICATION_CREDENTIALS");
  if ((args.minImages !== undefined || args.allowReuse) && !args.direct) {
    fail("--min-images and --allow-reuse only work with --direct");
  }

  const imagePaths = await resolveImagePaths(args.images);

  // Resolve and set ENGINE_CACHE_DIR before importing engine modules
  // (they read the env var at call time, not import time).
  if (args.cacheDir || args.resume) {
    const cacheDir = args.cacheDir
      ? (isAbsolute(args.cacheDir) ? args.cacheDir : resolve(process.cwd(), args.cacheDir))
      : await computeCacheDir(imagePaths, args.template, args.aspectRatio);
    process.env.ENGINE_CACHE_DIR = cacheDir;
    console.log(`[test-engine] cache dir: ${cacheDir}`);
  }

  if (args.silentMusic) {
    const musicDir = await ensureSilentMusicDir();
    process.env.ENGINE_MUSIC_DIR = musicDir;
    console.log(`[test-engine] silent music dir: ${musicDir}`);
  }

  const providerResolved =
    args.videoProvider ??
    (process.env.ENGINE_VIDEO_PROVIDER as VideoProviderArg | undefined) ??
    "piapi";
  console.log(`[test-engine] template=${args.template} images=${imagePaths.length} out=${args.out}`);
  console.log(`[test-engine] videoProvider=${providerResolved}`);
  if (!args.direct) {
    const executorDefault = args.advisor ? "claude-sonnet-4-6" : "claude-opus-4-6";
    console.log(`[test-engine] model=${process.env.ENGINE_ORCHESTRATOR_MODEL ?? executorDefault}`);
    if (args.advisor) {
      console.log(`[test-engine] advisor=claude-opus-4-6 (beta: advisor-tool-2026-03-01)`);
    }
    console.log(`[test-engine] running runEngineJob...`);
  }

  const startedAt = Date.now();
  const result = args.direct
    ? await runDirect(args, imagePaths, startedAt)
    : await runEngineJob({
        imagePaths,
        templateName: args.template,
        outputPath: args.out,
        ...(args.videoProvider ? { videoProvider: args.videoProvider } : {}),
      });
  const totalMs = Date.now() - startedAt;

  console.log("");
  if (result.status === "success") {
    console.log(`[test-engine] ✔ SUCCESS in ${totalMs}ms`);
    console.log(`  video:    ${result.videoPath}`);
    console.log(`  template: ${result.timeline.templateName}`);
    console.log(`  scenes:   ${result.timeline.scenes.length}`);
    console.log(`  duration: ${result.render.durationSec.toFixed(2)}s (target ${result.timeline.targetDurationSec}s)`);
    console.log(`  size:     ${(result.render.sizeBytes / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  codec:    ${result.render.codec} ${result.render.width}x${result.render.height}`);
    console.log(`  renderMs: ${result.render.renderMs}`);
    console.log(`  unfilled: ${result.timeline.unfilledSlotIds.join(", ") || "(none)"}`);
    if (result.timeline.warnings.length) {
      console.log(`  warnings:`);
      for (const w of result.timeline.warnings) console.log(`    - ${w}`);
    }
    if (result.runId) console.log(`  runId:    ${result.runId}`);
    console.log(`  scene breakdown:`);
    const promptBySceneId = new Map((result.scenePrompts ?? []).map((p) => [p.sceneId, p]));
    for (const scene of result.timeline.scenes) {
      const p = promptBySceneId.get(scene.sceneId);
      console.log(
        `    ${scene.order + 1}. ${scene.slotId.padEnd(16)} ${scene.imageRoomType.padEnd(10)} ${scene.sceneRole.padEnd(8)} ${scene.durationSec.toFixed(1)}s →${scene.transitionOut} ${basename(scene.imagePath)}`,
      );
      if (p) {
        console.log(`         prompt: ${p.prompt.slice(0, 120)}${p.prompt.length > 120 ? "…" : ""}`);
        console.log(`         model:  ${p.modelChoice}${p.modelReason ? ` (${p.modelReason})` : ""}`);
      }
    }
    process.exit(0);
  } else {
    console.error(`[test-engine] ✘ FAILED in ${totalMs}ms`);
    console.error(`  layer:   ${result.layer}`);
    console.error(`  reason:  ${result.reason}`);
    console.error(`  message: ${result.message}`);
    if (result.details) {
      console.error(`  details: ${JSON.stringify(result.details, null, 2)}`);
    }
    process.exit(2);
  }
}

main().catch((err) => {
  console.error("[test-engine] UNCAUGHT", err);
  process.exit(3);
});
