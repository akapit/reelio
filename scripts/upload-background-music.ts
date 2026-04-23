#!/usr/bin/env tsx
/**
 * Upload local MP3 files to the background-music/ library in R2.
 *
 * Usage:
 *   # Upload every .mp3 under a local dir:
 *   npx tsx scripts/upload-background-music.ts ./local-music
 *
 *   # The on-disk layout must mirror the R2 layout:
 *   ./local-music/upbeat/*.mp3
 *   ./local-music/luxury/*.mp3
 *   ./local-music/calm/*.mp3
 *
 *   # Override the local root (default: ./background-music-library/):
 *   BG_MUSIC_LOCAL_DIR=./my-folder npx tsx scripts/upload-background-music.ts
 *
 * Dry-run (no upload, just print):
 *   DRY_RUN=1 npx tsx scripts/upload-background-music.ts ./local-music
 *
 * License check is YOUR responsibility — only drop CC0 / royalty-free
 * tracks in. The script doesn't inspect licenses.
 */

import { config as loadEnv } from "dotenv";
import { resolve, basename, join } from "node:path";
import { readdir, readFile, stat } from "node:fs/promises";
import { S3Client, PutObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

const MOODS = ["upbeat", "luxury", "calm"] as const;
type Mood = (typeof MOODS)[number];

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing env var ${name}. Load .env.local first.`);
    process.exit(1);
  }
  return value;
}

const endpoint = requireEnv("CLOUDFLARE_R2_ENDPOINT");
const accessKeyId = requireEnv("CLOUDFLARE_R2_ACCESS_KEY_ID");
const secretAccessKey = requireEnv("CLOUDFLARE_R2_SECRET_ACCESS_KEY");
const bucket = requireEnv("CLOUDFLARE_R2_BUCKET_NAME");

const r2 = new S3Client({
  region: "auto",
  endpoint,
  credentials: { accessKeyId, secretAccessKey },
});

const dryRun = process.env.DRY_RUN === "1";

async function walkMoodDir(root: string, mood: Mood): Promise<string[]> {
  const dir = join(root, mood);
  try {
    const entries = await readdir(dir);
    const out: string[] = [];
    for (const name of entries) {
      const full = join(dir, name);
      const st = await stat(full);
      if (st.isFile() && name.toLowerCase().endsWith(".mp3")) {
        out.push(full);
      }
    }
    return out;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

async function listRemote(mood: Mood): Promise<Set<string>> {
  const res = await r2.send(
    new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: `background-music/${mood}/`,
    }),
  );
  const out = new Set<string>();
  for (const obj of res.Contents ?? []) {
    if (obj.Key) out.add(obj.Key);
  }
  return out;
}

async function uploadOne(localPath: string, mood: Mood): Promise<string> {
  const name = basename(localPath);
  const key = `background-music/${mood}/${name}`;
  const body = await readFile(localPath);
  if (dryRun) {
    console.log(`  [dry-run] would upload ${localPath} -> s3://${bucket}/${key} (${body.byteLength} bytes)`);
    return key;
  }
  await r2.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: new Uint8Array(body),
      ContentType: "audio/mpeg",
    }),
  );
  console.log(`  ok ${localPath} -> s3://${bucket}/${key} (${body.byteLength} bytes)`);
  return key;
}

async function main() {
  const cliRoot = process.argv[2];
  const root = resolve(
    cliRoot ?? process.env.BG_MUSIC_LOCAL_DIR ?? "./background-music-library",
  );
  console.log(`Local root: ${root}`);
  console.log(`Bucket:     ${bucket}`);
  console.log(`Dry-run:    ${dryRun}`);
  console.log("");

  let totalUploaded = 0;
  let totalSkipped = 0;
  for (const mood of MOODS) {
    const locals = await walkMoodDir(root, mood);
    const remote = await listRemote(mood);
    console.log(`[${mood}] local=${locals.length} remote=${remote.size}`);
    for (const f of locals) {
      const key = `background-music/${mood}/${basename(f)}`;
      if (remote.has(key)) {
        console.log(`  skip (exists) ${key}`);
        totalSkipped++;
        continue;
      }
      try {
        await uploadOne(f, mood);
        totalUploaded++;
      } catch (err) {
        console.error(`  ERR ${f}:`, err instanceof Error ? err.message : err);
      }
    }
  }

  console.log(`\nDone. uploaded=${totalUploaded} skipped=${totalSkipped}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
