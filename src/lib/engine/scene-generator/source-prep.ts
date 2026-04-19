import path from "node:path";
import { tmpdir } from "node:os";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";

import { PutObjectCommand } from "@aws-sdk/client-s3";

import type {
  AspectRatio,
  ImageMetadata,
  PreparedSceneSource,
  Scene,
} from "@/lib/engine/models";
import {
  applyCrop,
  computeCropRect,
  type CropRect,
} from "@/lib/engine/vision/smartCrop";
import { getPublicUrl, r2 } from "@/lib/r2";

const ASPECT_AR: Record<AspectRatio, number> = {
  "16:9": 16 / 9,
  "9:16": 9 / 16,
  "1:1": 1,
};

function log(event: string, sceneId: string, data: Record<string, unknown> = {}): void {
  try {
    console.log(
      JSON.stringify({ source: "engine.sceneSourcePrep", event, sceneId, ...data }),
    );
  } catch {
    // logging must never throw
  }
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function resolveScratchDir(explicit?: string): string {
  if (explicit) return explicit;
  const cacheDir = process.env.ENGINE_CACHE_DIR;
  if (cacheDir) return path.join(cacheDir, "scene-prep");
  return path.join(tmpdir(), "engine-scene-prep");
}

function extensionFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const ext = path.extname(parsed.pathname);
    return ext || ".jpg";
  } catch {
    return ".jpg";
  }
}

function extensionFromContentType(contentType: string | null): string {
  if (!contentType) return ".jpg";
  if (contentType.includes("png")) return ".png";
  if (contentType.includes("webp")) return ".webp";
  if (contentType.includes("gif")) return ".gif";
  return ".jpg";
}

function contentTypeFromPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    default:
      return "image/jpeg";
  }
}

async function downloadRemoteImage(sceneId: string, imageUrl: string, scratchDir: string): Promise<string> {
  const downloadDir = path.join(scratchDir, "downloads");
  await mkdir(downloadDir, { recursive: true });

  const urlHash = createHash("sha1").update(imageUrl).digest("hex");
  const fallbackExt = extensionFromUrl(imageUrl);

  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`download failed ${response.status} for ${imageUrl}`);
  }
  const ext = extensionFromContentType(response.headers.get("content-type")) || fallbackExt;
  const outputPath = path.join(downloadDir, `${urlHash}${ext}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(outputPath, buffer);

  log("source.downloaded", sceneId, {
    imageUrl,
    outputPath,
    byteLength: buffer.byteLength,
  });
  return outputPath;
}

async function uploadPreparedImage(localPath: string, uploadPrefix: string): Promise<string> {
  const bytes = await readFile(localPath);
  const digest = createHash("sha1").update(bytes).digest("hex");
  const ext = path.extname(localPath) || ".jpg";
  const key = `${uploadPrefix}/engine-prepared/${digest}-${randomUUID()}${ext}`;

  await r2.send(
    new PutObjectCommand({
      Bucket: process.env.CLOUDFLARE_R2_BUCKET_NAME!,
      Key: key,
      Body: bytes,
      ContentType: contentTypeFromPath(localPath),
    }),
  );

  return getPublicUrl(key);
}

export interface PrepareSceneSourceInput {
  scene: Scene;
  aspectRatio: AspectRatio;
  imagesByPath?: Map<string, ImageMetadata>;
  scratchDir?: string;
  uploadPrefix?: string;
}

export async function prepareSceneSource(
  input: PrepareSceneSourceInput,
): Promise<PreparedSceneSource> {
  const { scene, aspectRatio, imagesByPath } = input;
  const sourceIsRemote = isHttpUrl(scene.imagePath);
  const uploadPrefix = input.uploadPrefix ?? "engine";
  const scratchDir = resolveScratchDir(input.scratchDir);
  const meta = imagesByPath?.get(scene.imagePath);

  let crop: CropRect | null = null;
  if (meta) {
    crop = computeCropRect(meta.dims, meta.visionObjects, ASPECT_AR[aspectRatio]);
  }

  if (sourceIsRemote && (!crop || crop.noop)) {
    return {
      originalImagePath: scene.imagePath,
      providerImageUrl: scene.imagePath,
      localizedFromRemote: false,
      crop,
      uploadedPreparedUrl: null,
      sourceLocalPath: null,
      preparedLocalPath: null,
    };
  }

  const sourceLocalPath = sourceIsRemote
    ? await downloadRemoteImage(scene.sceneId, scene.imagePath, scratchDir)
    : scene.imagePath;
  const preparedLocalPath =
    crop && !crop.noop
      ? await applyCrop(sourceLocalPath, crop, path.join(scratchDir, "crops"))
      : sourceLocalPath;
  const uploadedPreparedUrl = await uploadPreparedImage(preparedLocalPath, uploadPrefix);

  log("source.prepared", scene.sceneId, {
    originalImagePath: scene.imagePath,
    sourceLocalPath,
    preparedLocalPath,
    uploadedPreparedUrl,
    cropReason: crop?.reason,
    cropNoop: crop?.noop,
  });

  return {
    originalImagePath: scene.imagePath,
    providerImageUrl: uploadedPreparedUrl,
    localizedFromRemote: sourceIsRemote,
    crop,
    sourceLocalPath,
    preparedLocalPath,
    uploadedPreparedUrl,
  };
}
