import { NextRequest, NextResponse } from "next/server";
import { createClient, getUserSafe } from "@/lib/supabase/server";
import { callCodex } from "@/lib/llm/codex";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const auth = await getUserSafe(supabase);
  if (auth.kind === "fetchFailed") {
    console.error(
      JSON.stringify({
        source: "generate-script",
        event: "auth.fetchFailed",
        error: String(auth.error),
      }),
    );
    return NextResponse.json(
      {
        error:
          "Couldn't verify your session — auth service unreachable. Please try again.",
        code: "auth_fetch_failed",
      },
      { status: 503 },
    );
  }
  if (auth.kind === "unauthenticated") {
    return NextResponse.json(
      { error: "Unauthorized", code: "unauthorized" },
      { status: 401 },
    );
  }
  // user reserved for future RLS-aware queries
  void auth.user;

  const { prompt, duration } = await req.json();
  if (!prompt || typeof prompt !== "string") {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  }

  // Scale word count to video length at a calm real-estate pace
  // (~2.5 words/sec). Duration is arbitrary — for Kling auto-fan it's
  // imageCount × perShotDuration (e.g. 5 images × 10s = 50s), so we can't
  // hard-code a 5/10 split anymore.
  const seconds = Math.max(3, Math.min(120, Math.round(Number(duration) || 5)));
  const minWords = Math.max(8, Math.round(seconds * 2));
  const maxWords = Math.max(minWords + 5, Math.round(seconds * 3));
  const charLimit = Math.max(60, seconds * 20);
  const wordGuide = `about ${minWords}-${maxWords} words`;

  const systemPrompt =
    `You are a professional real estate copywriter. Write a voiceover narration script for a ${seconds}-second property video. The script must be ${wordGuide} (under ${charLimit} characters) so it fits naturally when spoken at a calm pace. Be warm, inviting, and descriptive. Focus on the lifestyle and feelings the property evokes. Do not use quotes or stage directions — just the narration text.`;

  try {
    const { text } = await callCodex({
      system: systemPrompt,
      prompt: `Write a voiceover script for this real estate video: ${prompt}`,
    });
    return NextResponse.json({ script: text.trim() });
  } catch (err) {
    // Distinguish "LLM returned but had no parseable text" (502) from
    // other failures (500) to keep the pre-refactor response contract.
    const message = err instanceof Error ? err.message : String(err);
    console.error("[generate-script] error:", err);
    if (message.startsWith("codex ") || message.includes("no text in response")) {
      // codex HTTP non-2xx or empty output — upstream failure.
      return NextResponse.json({ error: "AI generation failed" }, { status: 502 });
    }
    return NextResponse.json({ error: "Failed to generate script" }, { status: 500 });
  }
}
