import type { TimelineBlueprint } from "@/lib/engine/models";

export function escapeDrawText(s: string): string {
  // Escape backslashes first, then single quotes, then colons.
  return s
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/:/g, "\\:");
}

function fontClause(fontPath: string): string {
  return fontPath ? `fontfile='${fontPath}':` : "";
}

function fmt(n: number): string {
  const rounded = Math.round(n * 1_000_000) / 1_000_000;
  return rounded.toString();
}

export function buildDrawText(
  timeline: TimelineBlueprint,
  fontPath: string,
): string[] {
  const fragments: string[] = [];
  const font = fontClause(fontPath);

  // Headline: fade in 0.3s, hold to 1.7s, fade out to 2.0s.
  const headline = timeline.overlays.headline;
  if (headline.enabled && headline.text) {
    const text = escapeDrawText(headline.text);
    fragments.push(
      `drawtext=${font}text='${text}':fontsize=64:fontcolor=white:x=(w-text_w)/2:y=h*0.12:alpha='if(lt(t,0.3),t/0.3,if(lt(t,1.7),1,if(lt(t,2),1-(t-1.7)/0.3,0)))'`,
    );
  }

  // Captions per-shot.
  if (timeline.overlays.captions.enabled) {
    let startSec = 0;
    for (const shot of timeline.shots) {
      if (shot.overlayText) {
        const esc = escapeDrawText(shot.overlayText);
        const end = startSec + shot.durationSec;
        fragments.push(
          `drawtext=${font}text='${esc}':fontsize=36:fontcolor=white:box=1:boxcolor=black@0.5:boxborderw=10:x=(w-text_w)/2:y=h-th-40:enable='between(t,${fmt(startSec)},${fmt(end)})'`,
        );
      }
      startSec += shot.durationSec;
    }
  }

  // CTA: last 3 seconds.
  const cta = timeline.overlays.cta;
  if (cta.enabled && cta.text) {
    const esc = escapeDrawText(cta.text);
    const gteStart = timeline.totalDurationSec - 3;
    fragments.push(
      `drawtext=${font}text='${esc}':fontsize=48:fontcolor=white:x=(w-text_w)/2:y=h*0.85:enable='gte(t,${fmt(gteStart)})'`,
    );
  }

  return fragments;
}
