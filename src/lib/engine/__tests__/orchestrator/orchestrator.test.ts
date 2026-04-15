import { describe, it, expect, vi } from "vitest";
import { runEngineJob } from "../../orchestrator/orchestrator";
import {
  fakeDataset,
  fakeRender,
  fakeTimeline,
  makeScriptedClient,
} from "./__fixtures__/anthropicResponses";

const REQ = {
  imagePaths: ["/tmp/a.jpg", "/tmp/b.jpg"],
  templateName: "luxury_30s",
  outputPath: "/tmp/out.mp4",
};

describe("runEngineJob", () => {
  it("happy path: analyze → build_timeline → render_video → JobResult", async () => {
    const dataset = fakeDataset(10);
    const timeline = fakeTimeline();
    const render = fakeRender("/tmp/out.mp4");

    const finalText = JSON.stringify({
      status: "success",
      videoPath: "/tmp/out.mp4",
      timeline,
      dataset,
      render,
      totalMs: 0,
    });

    const client = makeScriptedClient([
      {
        type: "tool_use",
        toolUses: [
          { id: "t1", name: "analyze_images", input: { image_paths: REQ.imagePaths } },
        ],
      },
      {
        type: "tool_use",
        toolUses: [
          {
            id: "t2",
            name: "build_timeline",
            input: { dataset, template_name: "luxury_30s" },
          },
        ],
      },
      {
        type: "tool_use",
        toolUses: [
          {
            id: "t3",
            name: "render_video",
            input: { timeline, output_path: "/tmp/out.mp4" },
          },
        ],
      },
      { type: "end_turn", text: finalText },
    ]);

    const exec = vi.fn(async (name: string) => {
      if (name === "analyze_images") return dataset;
      if (name === "build_timeline") return timeline;
      if (name === "render_video") return render;
      throw new Error(`unexpected tool ${name}`);
    });

    const out = await runEngineJob(REQ, { client, executeTool: exec });

    expect(out.status).toBe("success");
    if (out.status !== "success") return;
    expect(out.videoPath).toBe("/tmp/out.mp4");
    expect(typeof out.totalMs).toBe("number");
    expect(out.totalMs).toBeGreaterThanOrEqual(0);
    expect(exec).toHaveBeenCalledTimes(3);
    expect(exec.mock.calls.map((c) => c[0])).toEqual([
      "analyze_images",
      "build_timeline",
      "render_video",
    ]);
  });

  it("insufficient_images: model emits JobError without further tool calls", async () => {
    const dataset = fakeDataset(3);
    const errMsg = JSON.stringify({
      status: "error",
      layer: "planner",
      reason: "insufficient_images",
      message: "have 3, need 5",
      details: { have: 3, need: 5 },
    });

    const client = makeScriptedClient([
      {
        type: "tool_use",
        toolUses: [
          { id: "t1", name: "analyze_images", input: { image_paths: REQ.imagePaths } },
        ],
      },
      { type: "end_turn", text: errMsg },
    ]);

    const exec = vi.fn(async (name: string) => {
      if (name === "analyze_images") return dataset;
      throw new Error(`unexpected tool ${name}`);
    });

    const out = await runEngineJob(REQ, { client, executeTool: exec });
    expect(out.status).toBe("error");
    if (out.status !== "error") return;
    expect(out.reason).toBe("insufficient_images");
    expect(out.layer).toBe("planner");
    expect(exec).toHaveBeenCalledTimes(1);
  });

  it("force fast_15s: model overrides requested template when usableCount < 8", async () => {
    const dataset = fakeDataset(7);
    const timeline = fakeTimeline();
    const render = fakeRender();

    const finalText = JSON.stringify({
      status: "success",
      videoPath: "/tmp/out.mp4",
      timeline,
      dataset,
      render,
      totalMs: 0,
    });

    const client = makeScriptedClient([
      {
        type: "tool_use",
        toolUses: [
          { id: "t1", name: "analyze_images", input: { image_paths: REQ.imagePaths } },
        ],
      },
      {
        type: "tool_use",
        toolUses: [
          {
            id: "t2",
            name: "build_timeline",
            input: { dataset, template_name: "fast_15s" },
          },
        ],
      },
      {
        type: "tool_use",
        toolUses: [
          {
            id: "t3",
            name: "render_video",
            input: { timeline, output_path: "/tmp/out.mp4" },
          },
        ],
      },
      { type: "end_turn", text: finalText },
    ]);

    const exec = vi.fn(async (name: string, _input: unknown) => {
      void _input;
      if (name === "analyze_images") return dataset;
      if (name === "build_timeline") return timeline;
      if (name === "render_video") return render;
      throw new Error(`unexpected tool ${name}`);
    });

    const out = await runEngineJob(
      { ...REQ, templateName: "luxury_30s" },
      { client, executeTool: exec },
    );
    expect(out.status).toBe("success");
    const buildCall = exec.mock.calls.find((c) => c[0] === "build_timeline");
    expect(buildCall).toBeTruthy();
    const input = buildCall![1] as { template_name: string };
    expect(input.template_name).toBe("fast_15s");
  });

  it("planner abort: build_timeline returns abortedSlotIds → JobError", async () => {
    const dataset = fakeDataset(10);
    const errMsg = JSON.stringify({
      status: "error",
      layer: "planner",
      reason: "planner_slots_unfillable",
      message: "abort",
      details: { slotIds: ["s1"] },
    });

    const client = makeScriptedClient([
      {
        type: "tool_use",
        toolUses: [
          { id: "t1", name: "analyze_images", input: { image_paths: REQ.imagePaths } },
        ],
      },
      {
        type: "tool_use",
        toolUses: [
          {
            id: "t2",
            name: "build_timeline",
            input: { dataset, template_name: "luxury_30s" },
          },
        ],
      },
      { type: "end_turn", text: errMsg },
    ]);

    const exec = vi.fn(async (name: string) => {
      if (name === "analyze_images") return dataset;
      if (name === "build_timeline") return { abortedSlotIds: ["s1"] };
      throw new Error(`unexpected tool ${name}`);
    });

    const out = await runEngineJob(REQ, { client, executeTool: exec });
    expect(out.status).toBe("error");
    if (out.status !== "error") return;
    expect(out.reason).toBe("planner_slots_unfillable");
    expect(out.layer).toBe("planner");
  });

  it("tool error propagation: error envelope from analyze_images → JobError", async () => {
    const errMsg = JSON.stringify({
      status: "error",
      layer: "vision",
      reason: "vision_api_failure",
      message: "down",
    });

    const client = makeScriptedClient([
      {
        type: "tool_use",
        toolUses: [
          { id: "t1", name: "analyze_images", input: { image_paths: REQ.imagePaths } },
        ],
      },
      { type: "end_turn", text: errMsg },
    ]);

    const exec = vi.fn(async () => ({
      error: {
        status: "error",
        layer: "vision",
        reason: "vision_api_failure",
        message: "down",
      },
    }));

    const out = await runEngineJob(REQ, { client, executeTool: exec });
    expect(out.status).toBe("error");
    if (out.status !== "error") return;
    expect(out.reason).toBe("vision_api_failure");
    expect(out.layer).toBe("vision");
    expect(exec).toHaveBeenCalledTimes(1);
  });

  it("iteration cap: tool_use loop forever → timeout JobError", async () => {
    // Always returns tool_use so the loop never naturally ends.
    const looping: Parameters<typeof makeScriptedClient>[0] = [];
    for (let k = 0; k < 10; k++) {
      looping.push({
        type: "tool_use",
        toolUses: [{ id: `t${k}`, name: "analyze_images", input: { image_paths: REQ.imagePaths } }],
      });
    }
    const client = makeScriptedClient(looping);
    const exec = vi.fn(async () => fakeDataset(10));

    const out = await runEngineJob(REQ, {
      client,
      executeTool: exec,
      maxIterations: 3,
    });
    expect(out.status).toBe("error");
    if (out.status !== "error") return;
    expect(out.reason).toBe("timeout");
    expect(exec).toHaveBeenCalledTimes(3);
  });

  it("synthesized success: invalid final JSON but locals captured → synthesize JobResult", async () => {
    const dataset = fakeDataset(10);
    const timeline = fakeTimeline();
    const render = fakeRender("/tmp/out.mp4");

    const client = makeScriptedClient([
      {
        type: "tool_use",
        toolUses: [
          { id: "t1", name: "analyze_images", input: { image_paths: REQ.imagePaths } },
        ],
      },
      {
        type: "tool_use",
        toolUses: [
          {
            id: "t2",
            name: "build_timeline",
            input: { dataset, template_name: "luxury_30s" },
          },
        ],
      },
      {
        type: "tool_use",
        toolUses: [
          {
            id: "t3",
            name: "render_video",
            input: { timeline, output_path: "/tmp/out.mp4" },
          },
        ],
      },
      { type: "end_turn", text: "not json at all" },
    ]);

    const exec = vi.fn(async (name: string) => {
      if (name === "analyze_images") return dataset;
      if (name === "build_timeline") return timeline;
      if (name === "render_video") return render;
      throw new Error(`unexpected tool ${name}`);
    });

    const out = await runEngineJob(REQ, { client, executeTool: exec });
    expect(out.status).toBe("success");
    if (out.status !== "success") return;
    expect(out.videoPath).toBe("/tmp/out.mp4");
    expect(out.render).toMatchObject({ codec: "h264" });
  });

  it("bad stop_reason: max_tokens with no locals → JobError(unknown)", async () => {
    const client = makeScriptedClient([
      { type: "raw", stop_reason: "max_tokens", content: [] },
    ]);
    const exec = vi.fn();
    const out = await runEngineJob(REQ, { client, executeTool: exec });
    expect(out.status).toBe("error");
    if (out.status !== "error") return;
    expect(out.reason).toBe("unknown");
    expect(out.message).toContain("max_tokens");
    expect(exec).not.toHaveBeenCalled();
  });
});
