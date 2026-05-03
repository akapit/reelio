import { NextRequest, NextResponse } from "next/server";
import { createClient, getUserSafe } from "@/lib/supabase/server";
import { callCodex } from "@/lib/llm/codex";
import {
  estimateVoiceoverSeconds,
  maxVoiceoverSeconds,
  maxVoiceoverWords,
} from "@/lib/voiceover-duration";

const MAX_SCRIPT_IMAGES = 20;

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function asFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function collectMetadataText(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string" && value.trim().length > 0) {
    out.push(value.trim());
  } else if (Array.isArray(value)) {
    value.forEach((item) => collectMetadataText(item, out));
  } else if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    collectMetadataText(record.roomType, out);
    collectMetadataText(record.name, out);
    collectMetadataText(record.description, out);
    collectMetadataText(record.label, out);
    collectMetadataText(record.visionLabels, out);
    collectMetadataText(record.visionObjects, out);
    collectMetadataText(record.labels, out);
    collectMetadataText(record.objects, out);
  }
  return out;
}

function compactContext(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  return Object.entries(record)
    .map(([key, raw]) => {
      if (typeof raw !== "string" && typeof raw !== "number") return null;
      const valueText = String(raw).trim();
      return valueText ? `${key}: ${valueText}` : null;
    })
    .filter((part): part is string => part !== null)
    .join("; ");
}

function trimToWordBudget(text: string, maxWords: number): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return text.trim();
  return words.slice(0, maxWords).join(" ").replace(/[,.!?;:]+$/, "") + ".";
}

function firstContextValue(context: string, keys: string[]): string | null {
  for (const key of keys) {
    const match = context.match(new RegExp(`${key}:\\s*([^;\\n]+)`, "i"));
    const value = match?.[1]?.trim();
    if (value) return value;
  }
  return null;
}

function buildFallbackScript(input: {
  notes?: string;
  propertyContext: string;
  imageContext: string;
  maxWords: number;
}): string {
  const city = firstContextValue(input.propertyContext, ["city"]);
  const neighborhood = firstContextValue(input.propertyContext, ["neighborhood"]);
  const propertyType = firstContextValue(input.propertyContext, [
    "propertyType",
    "type",
  ]);
  const rooms = firstContextValue(input.propertyContext, ["rooms"]);
  const featureSource = `${input.notes ?? ""} ${input.propertyContext} ${input.imageContext}`;
  const hasView = /\b(view|sea|ocean|balcony|terrace|roof|rooftop|garden|yard|pool)\b/i.test(
    featureSource,
  );
  const hasLuxury = /\b(luxury|premium|penthouse|designer|modern|elegant)\b/i.test(
    featureSource,
  );
  const hasKitchen = /\b(kitchen|dining)\b/i.test(featureSource);
  const hasBedroom = /\b(bedroom|suite|primary)\b/i.test(featureSource);

  const location = neighborhood ?? city;
  const subject = propertyType ? `הנכס הזה` : "הבית המזמין הזה";
  const roomPhrase = rooms ? ` עם ${rooms} חדרים` : "";
  const details = [
    hasLuxury ? "גימורים מוקפדים" : "אור טבעי ונעים",
    hasKitchen ? "מטבח נוח וזרימה טובה לפינת האוכל" : null,
    hasBedroom ? "חללים פרטיים ושקטים" : null,
    hasView ? "רגעי חוץ ונוף יפים" : null,
  ].filter(Boolean);

  const script =
    `ברוכים הבאים אל ${subject}${roomPhrase}${location ? ` ב${location}` : ""}. ` +
    `בפנים תמצאו ${details.length > 0 ? details.join(", ") : "חללים רגועים, פרקטיים ונעימים למגורים"}. ` +
    `זו סביבת מגורים מחושבת ליום-יום נוח ולרגעים שכיף לזכור.`;
  return trimToWordBudget(script, input.maxWords);
}

async function fitScriptToBudget(
  script: string,
  maxSeconds: number,
  maxWords: number,
): Promise<string> {
  const cleaned = script.trim().replace(/^["“”']|["“”']$/g, "");
  if (estimateVoiceoverSeconds(cleaned) <= maxSeconds) return cleaned;

  try {
    const { text } = await callCodex({
      system:
        `Rewrite this real-estate voiceover narration in natural Hebrew so it fits in ${maxSeconds} seconds. ` +
        `Use at most ${maxWords} Hebrew words. Return Hebrew narration only, with no quotes, labels, or stage directions.`,
      prompt: cleaned,
    });
    const rewritten = text.trim().replace(/^["“”']|["“”']$/g, "");
    if (estimateVoiceoverSeconds(rewritten) <= maxSeconds) return rewritten;
    return trimToWordBudget(rewritten, maxWords);
  } catch {
    return trimToWordBudget(cleaned, maxWords);
  }
}

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

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const data = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const legacyPrompt = asString(data.prompt);
  const notes = asString(data.notes) ?? legacyPrompt;
  const videoDuration =
    asFiniteNumber(data.videoDurationSec) ??
    asFiniteNumber(data.duration) ??
    5;
  const seconds = Math.max(3, Math.min(120, Math.round(videoDuration)));
  const requestedMaxVoiceoverSec =
    asFiniteNumber(data.maxVoiceoverSec) ?? maxVoiceoverSeconds(seconds);
  const voiceoverSeconds = Math.max(
    3,
    Math.min(seconds, Math.round(requestedMaxVoiceoverSec)),
  );
  const maxWords = maxVoiceoverWords(voiceoverSeconds);
  const minWords = Math.max(6, Math.floor(maxWords * 0.65));
  const wordGuide = `${minWords}-${maxWords} words`;

  const imageAssetIds = Array.isArray(data.imageAssetIds)
    ? data.imageAssetIds
        .filter((id): id is string => typeof id === "string")
        .slice(0, MAX_SCRIPT_IMAGES)
    : [];
  const imageLabels = Array.isArray(data.imageLabels)
    ? data.imageLabels
        .filter((label): label is string => typeof label === "string")
        .slice(0, MAX_SCRIPT_IMAGES)
    : [];
  const propertyContext = compactContext(data.propertyContext);

  let imageContext = "";
  if (imageAssetIds.length > 0) {
    const { data: assets, error } = await supabase
      .from("assets")
      .select("id, user_id, metadata")
      .in("id", imageAssetIds);
    if (error) {
      return NextResponse.json(
        { error: "Failed to load selected photos" },
        { status: 500 },
      );
    }
    const byId = new Map((assets ?? []).map((asset) => [asset.id, asset]));
    for (const id of imageAssetIds) {
      const asset = byId.get(id);
      if (!asset) {
        return NextResponse.json({ error: `Asset ${id} not found` }, { status: 404 });
      }
      if (asset.user_id !== auth.user.id) {
        return NextResponse.json({ error: `Asset ${id} not accessible` }, { status: 403 });
      }
    }
    imageContext = imageAssetIds
      .map((id, index) => {
        const asset = byId.get(id);
        const metadata = (asset?.metadata ?? null) as unknown;
        const terms = [...new Set(collectMetadataText(metadata))]
          .slice(0, 8)
          .join(", ");
        return terms ? `Photo ${index + 1}: ${terms}` : `Photo ${index + 1}`;
      })
      .join("\n");
  } else if (imageLabels.length > 0) {
    imageContext = imageLabels
      .map((label, index) => `Photo ${index + 1}: ${label}`)
      .join("\n");
  }

  if (!notes && !propertyContext && !imageContext) {
    return NextResponse.json(
      { error: "prompt, notes, propertyContext, or image context is required" },
      { status: 400 },
    );
  }

  const systemPrompt =
    `You are a professional Hebrew real estate copywriter. Write a Hebrew voiceover narration script for a ${seconds}-second property video. ` +
    `The spoken Hebrew narration must finish within ${voiceoverSeconds} seconds, using ${wordGuide} at a calm real-estate pace. ` +
    `Match the property's vibe from the provided photo metadata and listing context. Be warm, inviting, specific, and concise. ` +
    `Use natural Israeli Hebrew. Do not use quotes, labels, bullet points, markdown, niqqud, or stage directions — return only the Hebrew narration text.`;

  const promptParts = [
    notes ? `User notes: ${notes}` : null,
    propertyContext ? `Listing context: ${propertyContext}` : null,
    imageContext ? `Selected photo context:\n${imageContext}` : null,
  ].filter(Boolean);

  try {
    const { text } = await callCodex({
      system: systemPrompt,
      prompt: promptParts.join("\n\n"),
    });
    const script = await fitScriptToBudget(text, voiceoverSeconds, maxWords);
    return NextResponse.json({
      script,
      estimatedSec: estimateVoiceoverSeconds(script),
      maxVoiceoverSec: voiceoverSeconds,
      maxWords,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[generate-script] error:", err);
    const script = buildFallbackScript({
      notes,
      propertyContext,
      imageContext,
      maxWords,
    });
    console.warn("[generate-script] using fallback script", { reason: message });
    return NextResponse.json({
      script,
      estimatedSec: estimateVoiceoverSeconds(script),
      maxVoiceoverSec: voiceoverSeconds,
      maxWords,
      fallback: true,
    });
  }
}
