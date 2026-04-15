#!/usr/bin/env -S npx tsx
/**
 * Local dry-run for the Kling multi-shot fan-out. No API calls.
 *
 * Shows exactly what per-shot prompts `trigger/generate-video.ts` will send
 * to kie.ai given a user prompt, image count, total duration, and optional
 * effect id. Runs the real `parseKlingShots` + `applyEffectToShots` helpers
 * (the same code the trigger task uses), so any drift between this output
 * and the production run is a bug in the trigger task, not in the helpers.
 *
 * USAGE
 *   npx tsx scripts/preview-kling-shots.ts \
 *     --prompt "Modern kitchen with marble island, bright living room, bedroom with ocean view" \
 *     --images 3 \
 *     --duration 15 \
 *     --effect boutique-listing
 *
 * FLAGS
 *   --prompt <string>   Required. The user-authored prompt.
 *   --images <int>      Image count (N shots on Kling auto-fan). Default: 3.
 *   --duration <int>    TOTAL video duration in seconds. Default: 5 * images.
 *   --effect <id>       Effect id from `src/lib/media/effects/library.ts`,
 *                       or `none` / omit. Try: `list` to print available ids.
 *   --json              Emit machine-readable JSON instead of the pretty output.
 *
 * EXAMPLES
 *   # List all available effect ids and their names
 *   npx tsx scripts/preview-kling-shots.ts --effect list
 *
 *   # 3 images, auto-fan, no effect
 *   npx tsx scripts/preview-kling-shots.ts --prompt "Kitchen, living room, bedroom" --images 3
 *
 *   # Same config with boutique-listing effect — see the opener/transition/closer wrap
 *   npx tsx scripts/preview-kling-shots.ts --prompt "Kitchen, living room, bedroom" --images 3 --effect boutique-listing
 */

import { parseKlingShots, applyEffectToShots } from "../src/lib/media/prompts/kling";
import { VIDEO_EFFECTS, getEffect } from "../src/lib/media/effects/library";

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      out[key] = true;
    } else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

function listEffects(): void {
  console.log("Available effects:\n");
  for (const e of VIDEO_EFFECTS) {
    console.log(`  ${e.id.padEnd(22)} ${e.name}`);
    console.log(`  ${"".padEnd(22)} ${e.description}`);
    console.log();
  }
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));

  if (args.effect === "list") {
    listEffects();
    process.exit(0);
  }

  const prompt = (args.prompt as string | undefined) ?? "";
  const images = args.images ? Number.parseInt(args.images as string, 10) : 3;
  const effectId =
    args.effect && args.effect !== "none" ? (args.effect as string) : undefined;
  const duration = args.duration
    ? Number.parseInt(args.duration as string, 10)
    : 5 * Math.max(1, images);

  if (!prompt) {
    console.error("error: --prompt is required\n");
    console.error("run `npx tsx scripts/preview-kling-shots.ts` with --help output:");
    console.error("  (see the header of scripts/preview-kling-shots.ts for flags)");
    process.exit(1);
  }

  const effect = getEffect(effectId);
  if (effectId && !effect) {
    console.error(
      `error: unknown effect id "${effectId}". run with --effect list to see available ids.`,
    );
    process.exit(1);
  }

  const parsed = parseKlingShots(prompt, duration, images);
  const effectSpec = effect
    ? {
        opener: effect.openerPhrase,
        transition: effect.transitionPhrase,
        closer: effect.closerPhrase,
      }
    : undefined;
  const wrappedShots = applyEffectToShots(parsed.shots, effectSpec);

  if (args.json) {
    console.log(
      JSON.stringify(
        {
          input: { prompt, images, duration, effectId: effectId ?? null },
          parsed: {
            mode: parsed.mode,
            rawShotCount: parsed.rawShotCount,
            mentionCount: parsed.mentionCount,
            totalDuration: parsed.totalDuration,
          },
          shots: wrappedShots.map((s, i) => ({
            index: i + 1,
            duration: s.duration,
            imageNumber: s.imageNumber,
            prompt: s.prompt,
            length: s.prompt.length,
          })),
        },
        null,
        2,
      ),
    );
    return;
  }

  // Pretty output
  const bar = "─".repeat(72);
  console.log(bar);
  console.log("INPUT");
  console.log(bar);
  console.log(`  userPrompt:    ${prompt}`);
  console.log(`  imageCount:    ${images}`);
  console.log(`  totalDuration: ${duration}s`);
  console.log(`  effect:        ${effect ? `${effect.id} (${effect.name})` : "(none)"}`);
  if (effect) {
    console.log(`    opener:      ${effect.openerPhrase}`);
    console.log(`    transition:  ${effect.transitionPhrase ?? "(none)"}`);
    console.log(`    closer:      ${effect.closerPhrase ?? "(none)"}`);
  }
  console.log();

  console.log(bar);
  console.log("PARSED BY parseKlingShots");
  console.log(bar);
  console.log(`  mode:          ${parsed.mode}`);
  console.log(`  shotCount:     ${parsed.shots.length}`);
  console.log(`  totalDuration: ${parsed.totalDuration}s (sum of per-shot)`);
  console.log(`  rawShotCount:  ${parsed.rawShotCount} (0 in auto-fan mode)`);
  console.log(`  mentionCount:  ${parsed.mentionCount}`);
  console.log();

  console.log(bar);
  console.log(
    effect
      ? `SHOT PROMPTS AFTER applyEffectToShots (effect applied)`
      : `SHOT PROMPTS (no effect)`,
  );
  console.log(bar);
  wrappedShots.forEach((shot, i) => {
    const role =
      i === 0
        ? "OPENER"
        : i === wrappedShots.length - 1 && wrappedShots.length > 1
          ? "CLOSER"
          : "MIDDLE";
    console.log();
    console.log(
      `  Shot ${i + 1}/${wrappedShots.length}  [${role}]  duration=${shot.duration}s  imageNumber=${shot.imageNumber ?? "none"}  length=${shot.prompt.length}`,
    );
    console.log(`  ${"-".repeat(70)}`);
    // Wrap long prompts at 70 chars for readable terminal output
    const words = shot.prompt.split(" ");
    let line = "  ";
    for (const word of words) {
      if ((line + word).length > 72) {
        console.log(line);
        line = "  " + word + " ";
      } else {
        line += word + " ";
      }
    }
    if (line.trim()) console.log(line);
  });
  console.log();
  console.log(bar);
  console.log(
    "  These are the exact prompt strings that will be sent to kie.ai for each shot.",
  );
  console.log("  Any difference in the actual generation means the trigger task is");
  console.log("  overriding them between here and the HTTP call.");
  console.log(bar);
}

main();
