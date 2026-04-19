import { describe, expect, it } from "vitest";

import type { MotionSpec, MotionType } from "@/lib/engine/models";
import { buildFilter } from "@/lib/engine/renderer/kenBurns";

const size = { width: 1920, height: 1080 };
const fps = 30;
const durationSec = 3; // D = 90

function specOf(type: MotionType): MotionSpec {
  return {
    type,
    startScale: 1.0,
    endScale: 1.0,
    startXPct: 0,
    endXPct: 0,
    startYPct: 0,
    endYPct: 0,
  };
}

describe("kenBurns.buildFilter", () => {
  it("ken_burns_in", () => {
    expect(buildFilter(specOf("ken_burns_in"), durationSec, fps, size)).toBe(
      "zoompan=z='min(zoom+(1.25-1.0)/(90-1),1.25)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=90:s=1920x1080:fps=30",
    );
  });

  it("ken_burns_out", () => {
    expect(buildFilter(specOf("ken_burns_out"), durationSec, fps, size)).toBe(
      "zoompan=z='if(eq(on,1),1.3,max(zoom-(1.3-1.05)/(90-1),1.05))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=90:s=1920x1080:fps=30",
    );
  });

  it("pan_left", () => {
    expect(buildFilter(specOf("pan_left"), durationSec, fps, size)).toBe(
      "zoompan=z=1.1:x='iw*0.2 - iw*0.2*on/(90-1)':y='ih*0.5-(ih/zoom/2)':d=90:s=1920x1080:fps=30",
    );
  });

  it("pan_right", () => {
    expect(buildFilter(specOf("pan_right"), durationSec, fps, size)).toBe(
      "zoompan=z=1.1:x='iw*0.2*on/(90-1)':y='ih*0.5-(ih/zoom/2)':d=90:s=1920x1080:fps=30",
    );
  });

  it("slow_zoom", () => {
    expect(buildFilter(specOf("slow_zoom"), durationSec, fps, size)).toBe(
      "zoompan=z='min(zoom+(1.08-1.0)/(90-1),1.08)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=90:s=1920x1080:fps=30",
    );
  });

  it("static", () => {
    expect(buildFilter(specOf("static"), durationSec, fps, size)).toBe(
      "zoompan=z=1.0:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=90:s=1920x1080:fps=30",
    );
  });

  it("rounds fractional D values", () => {
    const s = buildFilter(specOf("static"), 2.5, fps, size);
    expect(s).toContain("d=75");
    expect(s).toContain("s=1920x1080");
    expect(s).toContain("fps=30");
  });
});
