# kie.ai API Reference (Reelio-Relevant Subset)

Source: https://docs.kie.ai/  
Last updated: 2026-04-12

## Base URL

```
https://api.kie.ai
```

## Authentication

All endpoints use Bearer token authentication:

```
Authorization: Bearer YOUR_API_KEY
```

API keys are managed at: https://kie.ai/api-key

---

## Unified API Structure

All Market models (image, video, audio) share the same two endpoints:

### Create Task

```
POST https://api.kie.ai/api/v1/jobs/createTask
```

The `model` field in the request body determines which AI model processes the task.

### Query Task Status

```
GET https://api.kie.ai/api/v1/jobs/recordInfo?taskId={taskId}
```

---

## Task Polling (Get Task Details)

**Endpoint:** `GET /api/v1/jobs/recordInfo`

**Query Parameters:**

| Parameter | Type   | Required | Description                     |
|-----------|--------|----------|---------------------------------|
| taskId    | string | Yes      | Task ID returned from createTask |

**Response:**

```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "taskId": "task_12345678",
    "model": "topaz/image-upscale",
    "state": "success",
    "param": "{\"model\":\"topaz/image-upscale\", ...}",
    "resultJson": "{\"resultUrls\":[\"https://example.com/output.jpg\"]}",
    "failCode": "",
    "failMsg": "",
    "costTime": 15000,
    "completeTime": 1698765432000,
    "createTime": 1698765400000,
    "updateTime": 1698765432000
  }
}
```

**Task States:**

| State        | Description                          |
|-------------|--------------------------------------|
| `waiting`   | Task is queued, waiting to start     |
| `queuing`   | Task is in the processing queue      |
| `generating`| Task is currently being processed    |
| `success`   | Task completed successfully          |
| `fail`      | Task failed                          |

**Result format:** `resultJson` is a JSON string. For images/videos:
```json
{"resultUrls": ["https://example.com/generated-content.jpg"]}
```

**Best practices:**
- Use `callBackUrl` in createTask to avoid polling
- Implement exponential backoff: start at 2-3s intervals, increase gradually
- Stop polling after 10-15 minutes
- Generated content URLs expire after 24 hours

---

## Response Status Codes

| Code | Description                                    |
|------|------------------------------------------------|
| 200  | Success                                        |
| 401  | Unauthorized - missing/invalid API key         |
| 402  | Insufficient credits                           |
| 404  | Not found                                      |
| 422  | Validation error - bad parameters              |
| 429  | Rate limited                                   |
| 455  | Service unavailable (maintenance)              |
| 500  | Server error                                   |
| 501  | Generation failed                              |
| 505  | Feature disabled                               |

---

## Image Enhancement / Upscaling

### Topaz Image Upscale

**Model ID:** `topaz/image-upscale`

**Request:**

```json
POST /api/v1/jobs/createTask
{
  "model": "topaz/image-upscale",
  "callBackUrl": "https://your-domain.com/api/callback",
  "input": {
    "image_url": "https://example.com/photo.jpg",
    "upscale_factor": "2"
  }
}
```

**Input Parameters:**

| Parameter      | Type   | Required | Description                                |
|----------------|--------|----------|--------------------------------------------|
| image_url      | string | Yes      | URL of image to upscale (jpeg/png/webp, max 10MB) |
| upscale_factor | string | Yes      | Factor: `"1"`, `"2"`, `"4"`, or `"8"` (default: `"2"`) |

**Response:**

```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "taskId": "task_topaz_1765176093786"
  }
}
```

### Recraft Crisp Upscale

**Model ID:** `recraft/crisp-upscale`

**Request:**

```json
POST /api/v1/jobs/createTask
{
  "model": "recraft/crisp-upscale",
  "callBackUrl": "https://your-domain.com/api/callback",
  "input": {
    "image": "https://example.com/photo.jpg"
  }
}
```

**Input Parameters:**

| Parameter | Type   | Required | Description                                |
|-----------|--------|----------|--------------------------------------------|
| image     | string | Yes      | URL of image to upscale (jpeg/png/webp, max 10MB) |

Note: Recraft uses `image` (not `image_url`).

---

## Image Generation / Editing (Flux Kontext)

**Endpoint:** `POST /api/v1/flux/kontext/generate` (different from unified createTask)

**Model IDs:** `flux-kontext-pro`, `flux-kontext-max`

**Request:**

```json
POST /api/v1/flux/kontext/generate
{
  "prompt": "Professional modern living room, fully furnished",
  "inputImage": "https://example.com/empty-room.jpg",
  "aspectRatio": "16:9",
  "outputFormat": "jpeg",
  "model": "flux-kontext-pro",
  "enableTranslation": true,
  "callBackUrl": "https://your-domain.com/callback"
}
```

**Parameters:**

| Parameter         | Type    | Required | Description                                     |
|-------------------|---------|----------|-------------------------------------------------|
| prompt            | string  | Yes      | Text description (English only unless enableTranslation=true) |
| inputImage        | string  | No       | URL of input image for editing mode              |
| aspectRatio       | string  | No       | `"21:9"`, `"16:9"`, `"4:3"`, `"1:1"`, `"3:4"`, `"9:16"` (default: `"16:9"`) |
| outputFormat      | string  | No       | `"jpeg"` or `"png"` (default: `"jpeg"`)          |
| model             | string  | No       | `"flux-kontext-pro"` or `"flux-kontext-max"` (default: `"flux-kontext-pro"`) |
| enableTranslation | boolean | No       | Auto-translate non-English prompts (default: true) |
| promptUpsampling  | boolean | No       | Upsample prompt for more detail (default: false)  |
| safetyTolerance   | integer | No       | 0-6 for generation, 0-2 for editing (default: 2)  |
| callBackUrl       | string  | No       | Webhook URL for completion notification           |

**Response:**

```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "taskId": "task12345"
  }
}
```

**Get Results:** `GET /api/v1/flux/kontext/record-info?taskId={taskId}`

Note: Images expire after 14 days.

---

## Video Generation (Kling Models)

All Kling video models use the unified `POST /api/v1/jobs/createTask` endpoint.

### Kling 2.6 Image to Video

**Model ID:** `kling-2.6/image-to-video`

**Request:**

```json
POST /api/v1/jobs/createTask
{
  "model": "kling-2.6/image-to-video",
  "callBackUrl": "https://your-domain.com/api/callback",
  "input": {
    "prompt": "Slow camera pan across the living room",
    "image_urls": ["https://example.com/photo.jpg"],
    "sound": false,
    "duration": "5"
  }
}
```

**Input Parameters:**

| Parameter  | Type     | Required | Description                                     |
|------------|----------|----------|-------------------------------------------------|
| prompt     | string   | Yes      | Text prompt for video (max 1000 chars)           |
| image_urls | string[] | Yes      | Array with 1 image URL (jpeg/png/webp, max 10MB) |
| sound      | boolean  | Yes      | Whether generated video has sound                |
| duration   | string   | Yes      | `"5"` or `"10"` seconds (default: `"5"`)         |

### Kling 2.6 Text to Video

**Model ID:** `kling-2.6/text-to-video`

**Input Parameters:**

| Parameter    | Type    | Required | Description                                     |
|-------------|---------|----------|-------------------------------------------------|
| prompt      | string  | Yes      | Text prompt (max 1000 chars)                     |
| sound       | boolean | Yes      | Whether video has sound                          |
| aspect_ratio| string  | Yes      | `"1:1"`, `"16:9"`, `"9:16"` (default: `"1:1"`)  |
| duration    | string  | Yes      | `"5"` or `"10"` seconds                          |

### Kling V2.5 Turbo Image to Video Pro

**Model ID:** `kling/v2-5-turbo-image-to-video-pro`

**Input Parameters:**

| Parameter       | Type   | Required | Description                                    |
|----------------|--------|----------|------------------------------------------------|
| prompt         | string | Yes      | Text prompt (max 2500 chars)                    |
| image_url      | string | Yes      | Single image URL (not array)                    |
| duration       | string | No       | `"5"` or `"10"` (default: `"5"`)                |
| negative_prompt| string | No       | What to exclude (max 500 chars)                  |
| cfg_scale      | number | No       | Guidance scale 0-1, step 0.1 (default: 0.5)     |

Note: This model uses `image_url` (singular string), not `image_urls` (array).

### Kling 3.0

**Model ID:** `kling-3.0/video`

Supports single-shot and multi-shot modes, element references, and more.

**Input Parameters:**

| Parameter      | Type     | Required | Description                                    |
|---------------|----------|----------|------------------------------------------------|
| prompt        | string   | Yes*     | Prompt (for single-shot mode)                   |
| image_urls    | string[] | No       | First/last frame images                         |
| sound         | boolean  | Yes      | Enable sound effects                            |
| duration      | string   | Yes      | `"3"` to `"15"` seconds                         |
| aspect_ratio  | string   | Yes      | `"16:9"`, `"9:16"`, `"1:1"` (auto-adapts with images) |
| mode          | string   | Yes      | `"std"` (720p) or `"pro"` (1080p)               |
| multi_shots   | boolean  | Yes      | Enable multi-shot mode                          |
| multi_prompt  | array    | Yes*     | Shot definitions (for multi-shot mode)          |
| kling_elements| array    | No       | Element references (max 3)                      |

**Resolution by mode:**
- `std`: 1280x720 (16:9), 720x1280 (9:16), 720x720 (1:1)
- `pro`: 1920x1080 (16:9), 1080x1920 (9:16), 1080x1080 (1:1)

### All Available Kling Model IDs

| Model ID                              | Description                    |
|---------------------------------------|--------------------------------|
| `kling-2.6/image-to-video`           | Kling 2.6 Image to Video       |
| `kling-2.6/text-to-video`            | Kling 2.6 Text to Video        |
| `kling/v2-5-turbo-image-to-video-pro`| V2.5 Turbo Image to Video Pro  |
| `kling/v2-5-turbo-text-to-video-pro` | V2.5 Turbo Text to Video Pro   |
| `kling/v2-1-master-image-to-video`   | V2.1 Master Image to Video     |
| `kling/v2-1-master-text-to-video`    | V2.1 Master Text to Video      |
| `kling/v2-1-pro`                     | V2.1 Pro                       |
| `kling/v2-1-standard`                | V2.1 Standard                  |
| `kling-3.0/video`                    | Kling 3.0 (multi-shot support) |

---

## File Upload (URL-based)

**Endpoint:** `POST /api/file-url-upload`

Use this to upload images by URL before passing them to generation APIs.

**Request:**

```json
{
  "fileUrl": "https://example.com/photo.jpg",
  "uploadPath": "images/reelio",
  "fileName": "property-photo.jpg"
}
```

**Response:**

```json
{
  "success": true,
  "code": 200,
  "msg": "File uploaded successfully",
  "data": {
    "fileName": "property-photo.jpg",
    "filePath": "images/reelio/property-photo.jpg",
    "downloadUrl": "https://tempfile.redpandaai.co/xxx/images/reelio/property-photo.jpg",
    "fileSize": 154832,
    "mimeType": "image/png",
    "uploadedAt": "2025-01-01T12:00:00.000Z"
  }
}
```

Notes:
- Uploaded files are temporary and deleted after 3 days
- Download timeout is 30 seconds
- Max recommended file size: 100MB

---

## Check Account Credits

```
GET /api/v1/chat/credit
```

**Response:**

```json
{
  "code": 200,
  "msg": "success",
  "data": 100
}
```

---

## Download URL

Convert a generated file URL into a temporary downloadable link (valid for 20 minutes):

```
POST /api/v1/common/download-url
```

**Request:**

```json
{
  "url": "https://tempfile.xxx/generated-file.mp4"
}
```

---

## Callback (Webhook) Format

When using `callBackUrl`, the system POSTs results on task completion:

```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "taskId": "task12345",
    "info": {
      "originImageUrl": "https://example.com/original.jpg",
      "resultImageUrl": "https://example.com/result.jpg"
    }
  }
}
```

For webhook security/signature verification, see: https://docs.kie.ai/common-api/webhook-verification

---

## Credits and Pricing

- Image models: typically 10-50 credits per generation
- Video models: typically 100-500 credits per generation
- Language models: per-token usage

---

## Key Differences from Reelio's Original Implementation

1. **Unified endpoint:** All Market models use `POST /api/v1/jobs/createTask` (not model-specific paths)
2. **Task polling:** Uses `GET /api/v1/jobs/recordInfo?taskId={taskId}` (not `/api/task/{taskId}`)
3. **Task states:** `waiting`, `queuing`, `generating`, `success`, `fail` (not `completed`/`failed`)
4. **Result format:** Output URLs are in `data.resultJson` as a JSON string: `{"resultUrls": [...]}`
5. **Request structure:** Parameters are nested under `input` object (not flat)
6. **Flux Kontext:** Uses its own endpoint `/api/v1/flux/kontext/generate` (not createTask)
7. **Image URLs:** Kling 2.6 uses `image_urls` (array), V2.5 Turbo uses `image_url` (string)
