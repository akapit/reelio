/**
 * Background-music library — static royalty-free tracks stored in R2.
 *
 * Why static instead of AI-generated (ElevenLabs music):
 *   - Consistent vibe: curated tracks feel like real production music; AI
 *     music gen was hit-or-miss and sometimes off-genre for real-estate.
 *   - Speed: a ListObjects + GetObject round-trip is ~100-300ms; ElevenLabs
 *     music is a ~10-30s synthesis.
 *   - Cost: storage is free-ish; ElevenLabs music billed per generation.
 *   - Royalty: tracks sourced from CC0 / royalty-free libraries (Pixabay,
 *     Uppbeat, Artlist, etc.) — one-time curation, zero per-render cost.
 *
 * Layout in R2 (bucket `CLOUDFLARE_R2_BUCKET_NAME`):
 *   background-music/upbeat/<any>.mp3
 *   background-music/luxury/<any>.mp3
 *   background-music/calm/<any>.mp3
 *
 * Filenames are free-form; the picker lists everything under the mood
 * prefix and picks at random. Add/remove tracks by uploading/deleting
 * objects — no code change required.
 */

import { GetObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { r2 } from "@/lib/r2";

/** The three curated library moods. Keep this list in sync with R2 prefixes. */
export const MUSIC_MOODS = ["upbeat", "luxury", "calm"] as const;
export type MusicMood = (typeof MUSIC_MOODS)[number];

export function isMusicMood(value: string): value is MusicMood {
  return (MUSIC_MOODS as readonly string[]).includes(value);
}

const PREFIX = "background-music";

function log(event: string, data: Record<string, unknown> = {}): void {
  try {
    console.log(JSON.stringify({ source: "audio.library", event, ...data }));
  } catch {
    /* never throw from logging */
  }
}

async function readStreamToBuffer(body: unknown): Promise<Buffer> {
  // The AWS SDK v3 Body is a StreamingBlobPayloadOutputTypes — we support
  // both the browser-style transformToByteArray() (available in Node 18+
  // via web streams) and the legacy Readable stream form.
  if (body && typeof (body as { transformToByteArray?: unknown }).transformToByteArray === "function") {
    const bytes = await (body as { transformToByteArray: () => Promise<Uint8Array> }).transformToByteArray();
    return Buffer.from(bytes);
  }
  // Readable fallback.
  const chunks: Buffer[] = [];
  for await (const chunk of body as AsyncIterable<Buffer | Uint8Array>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export interface PickBackgroundTrackInput {
  mood: MusicMood;
  /**
   * Deterministic pick seed for tests. When unset, picks uniformly at
   * random. Typed as number so callers can hash a run id etc.
   */
  seed?: number;
}

export interface PickBackgroundTrackResult {
  /** The MP3 bytes, ready to hand to mergeAudioWithVideo. */
  buffer: Buffer;
  /** R2 object key, logged for observability / reproducibility. */
  key: string;
  /** Byte length of the track. */
  byteLength: number;
  /** How many tracks were available for this mood. */
  available: number;
  /** How long the list + download round-trip took, for the trigger task log. */
  fetchMs: number;
}

/**
 * Resolve one MP3 from the library for the given mood. Returns `null` when
 * the mood prefix is empty so callers can fall through to "no music".
 * Throws on transport errors (so we don't silently ship a voiceover-only
 * render when the caller expected music).
 */
export async function pickBackgroundTrack(
  input: PickBackgroundTrackInput,
): Promise<PickBackgroundTrackResult | null> {
  const start = Date.now();
  const bucket = process.env.CLOUDFLARE_R2_BUCKET_NAME;
  if (!bucket) {
    throw new Error(
      "pickBackgroundTrack: CLOUDFLARE_R2_BUCKET_NAME is not set",
    );
  }

  const prefix = `${PREFIX}/${input.mood}/`;
  const listed = await r2.send(
    new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
    }),
  );

  const mp3s = (listed.Contents ?? []).filter(
    (obj): obj is { Key: string } & typeof obj =>
      typeof obj.Key === "string" && obj.Key.toLowerCase().endsWith(".mp3"),
  );

  if (mp3s.length === 0) {
    log("empty", { mood: input.mood, prefix });
    return null;
  }

  const idx =
    typeof input.seed === "number"
      ? Math.abs(Math.trunc(input.seed)) % mp3s.length
      : Math.floor(Math.random() * mp3s.length);
  const pick = mp3s[idx];
  const key = pick.Key!;

  const got = await r2.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
  );

  if (!got.Body) {
    throw new Error(`pickBackgroundTrack: empty body for ${key}`);
  }

  const buffer = await readStreamToBuffer(got.Body);
  const fetchMs = Date.now() - start;
  log("pick", {
    mood: input.mood,
    key,
    available: mp3s.length,
    byteLength: buffer.byteLength,
    fetchMs,
  });

  return {
    buffer,
    key,
    byteLength: buffer.byteLength,
    available: mp3s.length,
    fetchMs,
  };
}
