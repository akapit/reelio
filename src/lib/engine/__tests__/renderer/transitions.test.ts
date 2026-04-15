import { describe, expect, it } from "vitest";

import type { TransitionType } from "@/lib/engine/models";
import { buildConcatGraph } from "@/lib/engine/renderer/transitions";

type Shot = { transitionOut: TransitionType; durationSec: number };

describe("transitions.buildConcatGraph", () => {
  it("builds xfade chain for 3 clips with fade/flash/cut", () => {
    const clips = ["a.mp4", "b.mp4", "c.mp4"];
    const shots: Shot[] = [
      { transitionOut: "fade", durationSec: 3 },
      { transitionOut: "flash", durationSec: 4 },
      { transitionOut: "cut", durationSec: 3 },
    ];

    const { args, filter } = buildConcatGraph(clips, shots);

    expect(args).toEqual(["-i", "a.mp4", "-i", "b.mp4", "-i", "c.mp4"]);

    // O1 = 3 - 0.5 = 2.5 (fade, 0.5s)
    // O2 = 3 + 4 - 0.2 = 6.8 (flash, 0.2s, fadewhite)
    // final label is [vout]
    const expected =
      "[0:v][1:v]xfade=transition=fade:duration=0.5:offset=2.5[v01];" +
      "[v01][2:v]xfade=transition=fadewhite:duration=0.2:offset=6.8[vout]";
    expect(filter).toBe(expected);
  });

  it("handles single clip with null relabel", () => {
    const { args, filter } = buildConcatGraph(
      ["solo.mp4"],
      [{ transitionOut: "cut", durationSec: 5 }],
    );
    expect(args).toEqual(["-i", "solo.mp4"]);
    expect(filter).toBe("[0:v]null[vout]");
  });

  it("treats cut as zero-duration fade xfade", () => {
    const { filter } = buildConcatGraph(
      ["a.mp4", "b.mp4"],
      [
        { transitionOut: "cut", durationSec: 2 },
        { transitionOut: "fade", durationSec: 2 },
      ],
    );
    expect(filter).toBe(
      "[0:v][1:v]xfade=transition=fade:duration=0:offset=2[vout]",
    );
  });

  it("maps dip_to_white to fadewhite at 0.5s", () => {
    const { filter } = buildConcatGraph(
      ["a.mp4", "b.mp4"],
      [
        { transitionOut: "dip_to_white", durationSec: 4 },
        { transitionOut: "cut", durationSec: 2 },
      ],
    );
    expect(filter).toBe(
      "[0:v][1:v]xfade=transition=fadewhite:duration=0.5:offset=3.5[vout]",
    );
  });

  it("throws on length mismatch", () => {
    expect(() =>
      buildConcatGraph(["a.mp4", "b.mp4"], [
        { transitionOut: "fade", durationSec: 2 },
      ]),
    ).toThrow(/mismatch/);
  });

  it("throws on empty clips", () => {
    expect(() => buildConcatGraph([], [])).toThrow(/non-empty/);
  });
});
