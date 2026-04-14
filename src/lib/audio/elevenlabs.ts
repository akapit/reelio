const BASE_URL = "https://api.elevenlabs.io";

export interface VoiceoverOptions {
  text: string;
  voiceId?: string; // default to a good narration voice
  modelId?: string; // default "eleven_v3"
}

export interface BackgroundMusicOptions {
  prompt: string;
  durationSeconds: number;
  loop?: boolean;
}

export interface AudioResult {
  buffer: Buffer;
  /** x-request-id from ElevenLabs — paste into support tickets for tracing. */
  requestId: string | null;
  durationMs: number;
  /** Model that actually ran, as configured. */
  model: string;
  /** Bytes returned in the audio payload, handy for spotting truncation. */
  byteLength: number;
}

/** Structured log so Trigger.dev captures the call as a queryable event. */
function logEl(event: string, data: Record<string, unknown>): void {
  try {
    console.log(JSON.stringify({ source: "elevenlabs", event, ...data }));
  } catch {
    console.log(`[elevenlabs] ${event}`);
  }
}
function logElError(event: string, data: Record<string, unknown>): void {
  try {
    console.error(
      JSON.stringify({ source: "elevenlabs", event, level: "error", ...data }),
    );
  } catch {
    console.error(`[elevenlabs] ${event} (error)`);
  }
}

export async function generateVoiceover(options: VoiceoverOptions): Promise<AudioResult> {
  const voiceId = options.voiceId ?? "21m00Tcm4TlvDq8ikWAM"; // "Rachel" - good narration voice
  const model = options.modelId ?? "eleven_v3";
  const start = Date.now();
  logEl("voiceover.request", { voiceId, model, textLength: options.text.length });

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": process.env.ELEVENLABS_API_KEY!,
      },
      body: JSON.stringify({
        text: options.text,
        model_id: model,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.5,
          speed: 1.0,
        },
      }),
    });
  } catch (err) {
    logElError("voiceover.networkError", {
      voiceId,
      model,
      durationMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }

  const requestId = res.headers.get("x-request-id");

  if (!res.ok) {
    const text = await res.text();
    logElError("voiceover.httpError", {
      voiceId,
      model,
      status: res.status,
      body: text,
      requestId,
      durationMs: Date.now() - start,
    });
    throw new Error(`ElevenLabs TTS error ${res.status}: ${text}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  logEl("voiceover.response", {
    voiceId,
    model,
    requestId,
    byteLength: buffer.byteLength,
    durationMs: Date.now() - start,
  });

  return {
    buffer,
    requestId,
    durationMs: Date.now() - start,
    model,
    byteLength: buffer.byteLength,
  };
}

export async function generateBackgroundMusic(options: BackgroundMusicOptions): Promise<AudioResult> {
  const model = "eleven_text_to_sound_v2";
  const start = Date.now();
  const duration = Math.min(options.durationSeconds, 30); // API max is 30s
  logEl("music.request", {
    model,
    duration,
    loop: options.loop ?? true,
    promptLength: options.prompt.length,
  });

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/v1/sound-generation`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": process.env.ELEVENLABS_API_KEY!,
      },
      body: JSON.stringify({
        text: options.prompt,
        duration_seconds: duration,
        prompt_influence: 0.3,
        loop: options.loop ?? true,
        model_id: model,
      }),
    });
  } catch (err) {
    logElError("music.networkError", {
      model,
      durationMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }

  const requestId = res.headers.get("x-request-id");

  if (!res.ok) {
    const text = await res.text();
    logElError("music.httpError", {
      model,
      status: res.status,
      body: text,
      requestId,
      durationMs: Date.now() - start,
    });
    throw new Error(`ElevenLabs SFX error ${res.status}: ${text}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  logEl("music.response", {
    model,
    requestId,
    byteLength: buffer.byteLength,
    durationMs: Date.now() - start,
  });

  return {
    buffer,
    requestId,
    durationMs: Date.now() - start,
    model,
    byteLength: buffer.byteLength,
  };
}
