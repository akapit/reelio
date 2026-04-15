# piapi.ai API Reference (Reelio-Relevant Subset)

Research target for a second media provider mirroring our current kie.ai provider. Focus: image enhancement, image editing (virtual staging + sky replacement), and video generation (Kling i2v, Seedance 2, Seedance 2 Fast).

Primary docs root: https://piapi.ai/docs/overview
Last researched: 2026-04-14

---

## 1. Authentication

- **Header:** `X-API-Key: <your-api-key>` (header name is case-insensitive; PiAPI docs use both `X-API-Key` and `x-api-key`)
- **No Bearer scheme.** Do not prepend `Bearer `. This is the single biggest shape difference from our current kie.ai provider, which uses `Authorization: Bearer ...`.
- **API key management:** https://app.piapi.ai (GitHub OAuth signup)
- **Signup / pricing entry point:** https://piapi.ai/pricing

### Pricing model (summary)

- **Pay-as-you-go (PPU) credits** — you buy credits, PiAPI bills each task against them.
- **Bring-your-own-account (BYOA)** — separate seat subscriptions ($5–$10/seat/mo) for self-hosted API pooling. Not relevant to us; we'll use PPU.
- Credit-to-dollar ratio not published on the pricing page; each model page quotes dollar-per-call pricing (e.g. `$0.13/sec` for Seedance 2). Trust the per-model pricing, not a global credit rate.
- Free plan exists but rate-limited.
- Sources: https://piapi.ai/pricing , https://piapi.ai/docs/quickstart

---

## 2. Transport: Unified Task API

PiAPI has **one create-task endpoint and one get-task endpoint** shared across all unified-schema models (Kling, Seedance, Nano Banana, Flux Kontext, etc.). Very similar to kie.ai's `createTask` / `recordInfo`, but with a different wrapper.

### Base URL

```
https://api.piapi.ai
```

### Create Task

```
POST https://api.piapi.ai/api/v1/task
Content-Type: application/json
X-API-Key: <key>
```

Request body envelope (every model):

```json
{
  "model": "<logical-model>",
  "task_type": "<task-subtype>",
  "input": { /* model-specific */ },
  "config": {
    "service_mode": "public",
    "webhook_config": {
      "endpoint": "https://your-app/webhook",
      "secret": "shared-secret"
    }
  }
}
```

The `config` block is optional. `service_mode` is `"public"` (PPU default) or `"private"` (BYOA). `webhook_config` is optional; omit to rely on polling.

### Get Task (polling)

```
GET https://api.piapi.ai/api/v1/task/{task_id}
X-API-Key: <key>
```

Note: `task_id` is a **path segment**, not a query param (kie.ai puts it in the query string; this is a portability diff).

### Task state machine

PiAPI's OpenAPI enum for unified tasks is **capital-cased**:

```
Pending | Processing | Staged | Completed | Failed
```

However, some example response JSON in their own docs uses lowercase (`"status": "completed"`). Treat the field as **case-insensitive** and normalize at parse time. `Staged` is a Midjourney-specific queue state that we'll never hit on video/image tasks but should be mapped to `queuing`.

Suggested mapping to our internal states:

| PiAPI status | Our state    |
|--------------|--------------|
| Pending      | waiting      |
| Staged       | queuing      |
| Processing   | generating   |
| Completed    | success      |
| Failed       | fail         |

### Standard response envelope

```json
{
  "code": 200,
  "data": {
    "task_id": "6e269e8c-2091-46c4-b4a5-40a4704a766a",
    "model": "kling",
    "task_type": "video_generation",
    "status": "Completed",
    "input": { /* echo */ },
    "output": { /* model-specific */ },
    "meta": {
      "created_at": "2026-04-05T23:03:48Z",
      "started_at": "2026-04-05T23:03:49Z",
      "ended_at":   "2026-04-05T23:06:53Z",
      "usage": { "type": "point", "frozen": 0, "consume": 6400000 },
      "is_using_private_pool": false
    },
    "error": { "code": 0, "message": "" }
  },
  "message": "success"
}
```

On failure: `status = "Failed"` and `data.error = { code: <non-zero>, message: "..." }`. Check `data.error.code !== 0` or `status === "Failed"`.

### Webhooks

Unified webhook fires on terminal states (`Completed` / `Failed`). Payload shape:

```json
{
  "timestamp": 1723018391,
  "data": { /* same as get-task's data block */ }
}
```

Secret is echoed in the `x-webhook-secret` header for verification. Retries up to 3 times with 5s backoff. Docs: https://piapi.ai/docs/unified-webhook

For our architecture (Trigger.dev task polls upstream provider), webhooks are optional — polling works fine.

---

## 3. Model Catalogue — Equivalents

### Video

| Our kie.ai model | PiAPI match | Slug (`model` / `task_type`) | Notes |
|---|---|---|---|
| `kling-2.6/image-to-video` | **Yes, clean match** | `model: "kling"`, `task_type: "video_generation"`, `input.version: "2.6"` | Same underlying Kuaishou model. Supports std/pro modes. |
| `bytedance/seedance-2` | **Yes, clean match** | `model: "seedance"`, `task_type: "seedance-2"` | Same ByteDance model. Slightly different input shape (see §4). |
| `bytedance/seedance-2-fast` | **Yes, clean match** | `model: "seedance"`, `task_type: "seedance-2-fast"` | Identical shape to `seedance-2`. |

Docs:
- Kling: https://piapi.ai/docs/kling-api/create-task
- Seedance 2: https://piapi.ai/docs/seedance-api/seedance-2
- Seedance 2 preview (adds VIP variants with video references): https://piapi.ai/docs/seedance-api/seedance-2-preview

### Image enhancement

| Our kie.ai model | PiAPI match | Slug | Notes |
|---|---|---|---|
| `nano-banana-pro` | **Yes, clean match** | `model: "gemini"`, `task_type: "nano-banana-pro"` | Same underlying Google Gemini 3 Pro Image model. Supports 1K / 2K / 4K resolutions. |

Docs: https://piapi.ai/docs/gemini-api/nano-banana-pro

Product landing: https://piapi.ai/nano-banana-pro — `$0.105` per 1K/2K image, `$0.18` per 4K image (cheaper than kie.ai at 2K).

### Image editing (virtual staging / sky replacement)

| Our kie.ai model | PiAPI match | Slug | Notes |
|---|---|---|---|
| `flux-kontext-pro` | **Partial — see gap** | `model: "Qubico/flux1-dev-advanced"`, `task_type: "kontext"` | PiAPI does **not** expose distinct Kontext Pro / Max / Dev endpoints through the unified API. They run Kontext via their own Qubico-packaged flux1-dev-advanced model with a `"kontext"` task type. |

Docs: https://piapi.ai/docs/flux-api/kontext (and general flux docs: https://piapi.ai/docs/flux-api/text-to-image )

**Gap note:** PiAPI markets Flux Kontext Pro / Max / Dev on their product pages (https://piapi.ai/flux-kontext/flux-kontext-pro , https://piapi.ai/flux-kontext/flux-kontext-max ), but the unified-API spec only documents the Qubico-wrapped variant. If Pro/Max quality specifically matters (it does for virtual staging — Pro is measurably better for interior spaces), consider keeping kie.ai as the staging provider and using PiAPI only for video. Alternative: Nano Banana Pro can also do image-to-image edits (up to 14 reference images) and is an acceptable staging fallback if Kontext tier quality is insufficient.

---

## 4. Request / Response Shapes

### 4.1 Image enhancement — Nano Banana Pro

**Create:**

```json
POST /api/v1/task
{
  "model": "gemini",
  "task_type": "nano-banana-pro",
  "input": {
    "prompt": "Enhance this real estate listing photo: boost clarity, correct white balance, brighten shadows, keep natural colours.",
    "image_urls": ["https://our-r2.example.com/source.jpg"],
    "output_format": "png",
    "aspect_ratio": "16:9",
    "resolution": "2K",
    "safety_level": "high"
  },
  "config": { "service_mode": "public" }
}
```

Key fields:

- `image_urls` — **array** (up to 14); for enhancement pass a single URL.
- `resolution` — `"1K" | "2K" | "4K"` (default `1K`). We want `2K` to match current kie.ai output.
- `output_format` — `"png"` or `"jpeg"`.
- `aspect_ratio` — `"1:1" | "16:9" | "4:3"` and more; we'll typically pass the source ratio or `"auto"` if supported.

**Poll output path:**

```json
"output": {
  "image_url": "https://img.theapi.app/...png",
  "image_urls": ["https://img.theapi.app/...png"]
}
```

Both `image_url` (singular) and `image_urls` (array) may appear; prefer `image_url` when present, else `image_urls[0]`.

### 4.2 Virtual staging & sky replacement — Flux Kontext (Qubico/flux1-dev-advanced)

Same request body for both use cases — the only difference is the prompt text. Mirrors how we already use Kontext via kie.ai.

**Create:**

```json
POST /api/v1/task
{
  "model": "Qubico/flux1-dev-advanced",
  "task_type": "kontext",
  "input": {
    "prompt": "Furnish this empty living room with a modern Scandinavian sofa, coffee table, rug, and floor lamp. Preserve room architecture, window placement, and lighting.",
    "image": "https://our-r2.example.com/empty-room.jpg",
    "width": 1024,
    "height": 1024,
    "seed": -1,
    "steps": 10
  }
}
```

Key differences vs kie.ai Flux Kontext:
- Field name is `image` (singular string), **not** `inputImage`.
- No `aspect_ratio` / `guidance_scale` / `output_format` / `safety_tolerance` parameters documented — just `width`, `height`, `seed`, `steps`.
- Must pass dimensions explicitly; PiAPI does not preserve input dimensions automatically.
- `steps` default is 28, max 40. Docs show 10 in examples.

**Poll output path:**

```json
"output": {
  "image_url": "https://img.theapi.app/...png"
}
```

### 4.3 Video — Kling 2.6 image-to-video

**Create:**

```json
POST /api/v1/task
{
  "model": "kling",
  "task_type": "video_generation",
  "input": {
    "prompt": "Slow cinematic push-in through the kitchen, afternoon light.",
    "negative_prompt": "",
    "cfg_scale": "0.5",
    "duration": 5,
    "aspect_ratio": "16:9",
    "mode": "std",
    "version": "2.6",
    "image_url": "https://our-r2.example.com/source.jpg",
    "enable_audio": false
  }
}
```

Key fields:
- `version` — `"2.0" | "2.1" | "2.1-master" | "2.5" | "2.6"`. We'll use `"2.6"`.
- `mode` — `"std" | "pro"`. Pro = higher quality, 2x price. `2.1-master` is pro-only.
- `duration` — `5 | 10` (integer seconds — **same enum as our current UI**).
- `aspect_ratio` — `"16:9" | "9:16" | "1:1"`.
- `image_url` — **singular string**, not array. (kie.ai uses `image_urls: [...]`.) Omit for text-to-video.
- `enable_audio` — boolean, `2.6` supports native audio in pro mode only (costs 2x pro price).
- `cfg_scale` — must be a JSON number (float64), e.g. `0.5`. PiAPI's own JSON example in the original docs quotes it as `"0.5"`, but the server rejects string values with `cannot unmarshal string into ... cfg_scale of type float64`. Always send it unquoted.

**Kling Elements** (separate task for multi-reference-image generation, version 1.6 only): `task_type: "video_generation"` with `input.elements: [{image: url}, ...]` (1–4). **Not available on 2.6** — this is a regression vs kie.ai, which allows `reference_image_urls` on Seedance. If we need multi-ref on Kling, we'd have to downgrade to 1.6. For our use case (Seedance already supports multi-ref), skip Kling Elements.

Pricing (per 5s video): 2.1 std $0.26, 2.1 pro $0.46, 2.5/2.6 std $0.20, 2.5/2.6 pro $0.33, 2.6 pro w/ native audio ~$0.66.

**Poll output path — two possible shapes:**

```json
// Shape A (Kling Turbo / some versions)
"output": { "video": "https://img.theapi.app/....mp4" }

// Shape B (Motion Control / standard Kling)
"output": {
  "works": [{
    "video": {
      "resource": "https://v15-kling.klingai.com/...mp4",
      "resource_without_watermark": "https://storage.theapi.app/videos/....mp4"
    }
  }]
}
```

Parser must handle both: prefer `output.video` (string), else `output.works[0].video.resource_without_watermark`, else `output.works[0].video.resource`. **Watch this when porting — kie.ai always gives a single top-level URL.**

### 4.4 Video — Seedance 2 / Seedance 2 Fast

**Create (image-to-video, first-frame mode):**

```json
POST /api/v1/task
{
  "model": "seedance",
  "task_type": "seedance-2",
  "input": {
    "prompt": "Cinematic dolly through the master bedroom, golden hour light through the window.",
    "mode": "first_last_frames",
    "duration": 5,
    "aspect_ratio": "16:9",
    "image_urls": ["https://our-r2.example.com/source.jpg"]
  }
}
```

**Create (multi-reference, omni mode):**

```json
{
  "model": "seedance",
  "task_type": "seedance-2-fast",
  "input": {
    "prompt": "Walk through the house in @image1 using the furniture style from @image2.",
    "mode": "omni_reference",
    "duration": 8,
    "aspect_ratio": "16:9",
    "image_urls": [
      "https://our-r2.example.com/primary.jpg",
      "https://our-r2.example.com/reference-1.jpg"
    ]
  }
}
```

Key differences vs kie.ai Seedance:
- **No `first_frame_url` / `reference_image_urls` split.** Both collapse into `image_urls` (array). The `mode` field selects behaviour: `"first_last_frames"` (1–2 images) or `"omni_reference"` (up to 12 mixed refs). This removes the mutex gotcha we currently handle — we now pick a `mode` instead.
- Modes: `"text_to_video" | "first_last_frames" | "omni_reference"`.
- `duration` — integer 4–15 (same as kie.ai; clamp identically).
- `aspect_ratio` — `"21:9" | "16:9" | "4:3" | "1:1" | "3:4" | "9:16" | "auto"` (auto only in `first_last_frames`). In `first_last_frames` mode, `aspect_ratio` is ignored and auto-derived from the image.
- Accepts `video_urls` and `audio_urls` only on VIP task types (`seedance-2-preview-vip` / `seedance-2-fast-preview-vip`). Base `seedance-2` / `seedance-2-fast` reject videos/audio.
- No `generate_audio`, `web_search`, `nsfw_checker` booleans — these kie.ai-specific flags don't exist here.
- Max 12 total references (we cap at 9 on kie.ai, stay consistent or relax).
- Image formats: jpg, jpeg, png, webp, bmp.

**Poll output path:** `data.output.video` (string URL). Simple.

Pricing:
- `seedance-2`: $0.13/sec
- `seedance-2-fast`: $0.10/sec
- Preview/VIP variants slightly different — use production models.

---

## 5. Gotchas / Porting Notes

### Auth / URL shape

1. **`X-API-Key` header, not `Authorization: Bearer`.** Our kie.ai client strips this detail — the new provider needs its own header.
2. **Task ID in path**, not query string: `GET /api/v1/task/{id}` vs kie.ai's `GET /api/v1/jobs/recordInfo?taskId={id}`.

### Request-body shape

3. **All models share the `{model, task_type, input, config}` envelope.** kie.ai puts model-specific fields at the top level under `createTask`; PiAPI wraps everything inside `input`.
4. **Field naming drift:**
   - Kling image: `image_url` (string) — kie.ai uses `image_urls` (array).
   - Flux Kontext image: `image` (string) — kie.ai uses `inputImage`.
   - Seedance image: `image_urls` (array) for both single- and multi-image cases — kie.ai has the `first_frame_url` vs `reference_image_urls` mutex.
5. **Seedance mode enum replaces the kie.ai mutex.** Pick `first_last_frames` for single-image → video, `omni_reference` for multi-image. No more 422 when both fields are set.
6. **Flux Kontext on PiAPI lacks `aspect_ratio` / `output_format` knobs.** You pass `width` × `height` explicitly. For sky replacement we should derive these from the source image dimensions, same as we'd do for a crop.

### Response shape

7. **Status casing is inconsistent** in PiAPI's own docs (enum is capital-case, examples are lowercase). Normalize to lowercase at parse time.
8. **Kling output URL is model-variant-dependent** — handle both `output.video` and `output.works[0].video.resource_without_watermark`. Seedance and Nano Banana are clean (`output.video`, `output.image_url`).
9. **Error object lives at `data.error`** with `{ code, message }`. Non-zero `code` = failure even if `status === "Completed"` (rare but documented).

### Inputs / storage

10. **Signed / expiring URLs may fail** per Seedance docs: *"Use publicly accessible URLs (e.g., hosted on a CDN or cloud storage). Signed/expiring URLs may fail."* Our R2 upload flow uses presigned URLs for source images — we should migrate those to public URLs or generate sufficiently long-lived signed URLs (≥ max polling window) before calling PiAPI. Kie.ai is more lenient here.
11. **Image size cap:** Kontext says input under 10MB; Kling says image ≥ 300px per side, max 10MB. Match these constraints in our upload validation.

### Rate limits / timing

12. **No public rate-limit docs.** Empirically, concurrency is governed by plan tier. Build the provider to treat 429 as "retry with backoff".
13. **Max polling timeout:** no single number documented, but from pricing/duration:
    - Nano Banana Pro: typically < 10s (match kie.ai).
    - Flux Kontext: ~10–30s.
    - Kling 2.6 std: 1–3 min. Pro: 2–5 min.
    - Seedance 2: 2–5 min for 5–10s outputs. Budget 10 min max.
14. **Webhooks work** and would remove the polling window problem, but our current Trigger.dev architecture polls — stick with polling, give each job a generous `maxDuration`.

### Pricing deltas vs kie.ai (spot check)

- Seedance 2: $0.13/sec on PiAPI. Kie.ai: similar range. Effectively neutral.
- Kling 2.6 std: $0.20/5s = $0.04/sec on PiAPI.
- Nano Banana Pro 2K: $0.105/image on PiAPI vs $0.134 on Google's native API — notable savings.
- Flux Kontext: pricing not published on the Qubico-wrapped unified doc; check workspace dashboard before committing.

---

## 6. Capability Mapping Table

| Our capability       | kie.ai model                     | PiAPI equivalent                                                           | Clean port? | Notes |
|----------------------|----------------------------------|----------------------------------------------------------------------------|-------------|-------|
| Image enhancement    | `nano-banana-pro`                | `model: "gemini"`, `task_type: "nano-banana-pro"`                           | Yes         | Same underlying Google Gemini 3 Pro Image model. Cheaper at 2K. Use `resolution: "2K"`. |
| Virtual staging      | `flux-kontext-pro` (Flux Kontext)| `model: "Qubico/flux1-dev-advanced"`, `task_type: "kontext"`                | Partial     | PiAPI only exposes a Qubico-wrapped Kontext via unified API; no explicit Pro/Max tier selector. Quality likely OK but not identical to kie.ai's Pro endpoint. |
| Sky replacement      | `flux-kontext-pro` (Flux Kontext)| `model: "Qubico/flux1-dev-advanced"`, `task_type: "kontext"`                | Partial     | Same endpoint as staging; differs only by prompt. Same tier caveat. |
| Video: Kling i2v     | `kling-2.6/image-to-video`       | `model: "kling"`, `task_type: "video_generation"`, `input.version: "2.6"` | Yes         | Use `image_url` singular. Native audio requires `mode: "pro"`. Output URL has two possible shapes — parser must handle both. |
| Video: Seedance 2    | `bytedance/seedance-2`           | `model: "seedance"`, `task_type: "seedance-2"`                              | Yes         | Mutex replaced by `mode` enum. All refs go in `image_urls`. |
| Video: Seedance Fast | `bytedance/seedance-2-fast`      | `model: "seedance"`, `task_type: "seedance-2-fast"`                         | Yes         | Identical shape to `seedance-2`. |

---

## 7. Key Doc URLs

- Overview: https://piapi.ai/docs/overview
- Quickstart: https://piapi.ai/docs/quickstart
- Unified schema: https://piapi.ai/docs/unified-api-schema
- Webhooks: https://piapi.ai/docs/unified-webhook
- Kling create-task: https://piapi.ai/docs/kling-api/create-task
- Kling get-task: https://piapi.ai/docs/kling-api/get-task
- Kling Elements (multi-ref, v1.6 only): https://piapi.ai/docs/kling-api/kling-elements
- Seedance 2: https://piapi.ai/docs/seedance-api/seedance-2
- Seedance 2 preview/VIP: https://piapi.ai/docs/seedance-api/seedance-2-preview
- Nano Banana Pro: https://piapi.ai/docs/gemini-api/nano-banana-pro
- Flux Kontext (unified): https://piapi.ai/docs/flux-api/kontext
- Flux txt2img / img2img: https://piapi.ai/docs/flux-api/text-to-image , https://piapi.ai/docs/flux-api/image-to-image
- Pricing: https://piapi.ai/pricing
- Product page — Nano Banana Pro: https://piapi.ai/nano-banana-pro
- Product page — Flux Kontext Pro: https://piapi.ai/flux-kontext/flux-kontext-pro
- Product page — Kling: https://piapi.ai/kling-api
- Product page — Seedance 2: https://piapi.ai/seedance-2-0
