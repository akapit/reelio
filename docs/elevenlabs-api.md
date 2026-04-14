# ElevenLabs API Reference (Reelio-Relevant Subset)

Source: https://elevenlabs.io/docs/api-reference
Last updated: 2026-04-12

## Base URL

```
https://api.elevenlabs.io
```

## Authentication

All endpoints use API key header:
```
xi-api-key: YOUR_API_KEY
```

---

## Text-to-Speech (Voiceover)

**Endpoint:** `POST /v1/text-to-speech/{voice_id}`

**Path Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| voice_id | string | Yes | Voice ID (get from /v1/voices endpoint) |

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| output_format | string | mp3_44100_128 | Audio format (mp3_44100_128, mp3_22050_32, pcm_16000, etc.) |

**Request Body:**
```json
{
  "text": "The text to convert to speech",
  "model_id": "eleven_v3",
  "voice_settings": {
    "stability": 0.5,
    "similarity_boost": 0.75,
    "style": 0.5,
    "speed": 1.0
  }
}
```

**Body Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| text | string | Yes | Text to speak (max ~5000 chars) |
| model_id | string | No | Model: `eleven_v3` (most expressive), `eleven_multilingual_v2`, `eleven_flash_v2_5` |
| language_code | string | No | ISO 639-1 language code |
| voice_settings | object | No | Stability, similarity_boost, style, speed, use_speaker_boost |

**Response:** `200` → binary audio (`application/octet-stream`)

**Models:**
- `eleven_v3` — Most expressive, highest quality, higher latency
- `eleven_multilingual_v2` — Good quality, 29 languages
- `eleven_flash_v2_5` — Fastest, lowest latency

---

## Sound Effects (Background Music/Ambience)

**Endpoint:** `POST /v1/sound-generation`

**Request Body:**
```json
{
  "text": "Soft ambient piano music for a luxury real estate video",
  "duration_seconds": 10,
  "prompt_influence": 0.3,
  "model_id": "eleven_text_to_sound_v2"
}
```

**Body Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| text | string | Yes | Description of the sound/music to generate |
| duration_seconds | number | No | Duration 0.5–30 seconds (auto if null) |
| prompt_influence | number | No | 0–1, how closely to follow prompt (default 0.3) |
| loop | boolean | No | Create seamless loop (v2 model only) |
| model_id | string | No | Default: `eleven_text_to_sound_v2` |

**Response:** `200` → binary audio (`application/octet-stream`)

---

## List Voices

**Endpoint:** `GET /v1/voices`

Returns all available voices. Each voice has:
- `voice_id`: string
- `name`: string  
- `category`: string (premade, cloned, etc.)
- `labels`: object (accent, description, age, gender, use_case)

---

## Reelio Integration Notes

### For Voiceover:
1. Call `POST /v1/text-to-speech/{voice_id}` with model `eleven_v3`
2. Get binary MP3 audio back
3. Upload to R2
4. Merge with video using FFmpeg in Trigger.dev task

### For Background Music:
1. Call `POST /v1/sound-generation` with music description
2. Set `duration_seconds` to match video length
3. Set `loop: true` for ambient tracks
4. Upload to R2
5. Mix with video (and optional voiceover) using FFmpeg

### FFmpeg Merge Command:
```bash
# Video + voiceover + background music
ffmpeg -i video.mp4 -i voiceover.mp3 -i music.mp3 \
  -filter_complex "[1:a]volume=1.0[vo];[2:a]volume=0.3[bg];[vo][bg]amix=inputs=2:duration=first[a]" \
  -map 0:v -map "[a]" -c:v copy -c:a aac -shortest output.mp4
```
