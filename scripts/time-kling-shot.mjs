import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { randomUUID } from "crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, "..", ".env.local");
const env = readFileSync(envPath, "utf8")
  .split("\n")
  .filter((l) => l && !l.startsWith("#"));
for (const line of env) {
  const eq = line.indexOf("=");
  if (eq < 0) continue;
  process.env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
}

const imagePath = process.argv[2];
if (!imagePath) {
  console.error("usage: node scripts/time-kling-shot.mjs <absolute-image-path>");
  process.exit(1);
}

const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");

const r2 = new S3Client({
  region: "auto",
  endpoint: process.env.CLOUDFLARE_R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
  },
});

const buffer = readFileSync(imagePath);
const key = `diagnostic/${randomUUID()}.jpg`;

const t0 = Date.now();
console.log(`[${tstr(t0)}] uploading ${imagePath} (${buffer.byteLength} bytes) → r2 key=${key}`);
await r2.send(
  new PutObjectCommand({
    Bucket: process.env.CLOUDFLARE_R2_BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: "image/jpeg",
  }),
);
const publicUrl = `${process.env.CLOUDFLARE_R2_PUBLIC_URL.replace(/\/$/, "")}/${key}`;
const tUpload = Date.now();
console.log(`[${tstr(tUpload)}] r2 upload done in ${tUpload - t0}ms. url=${publicUrl}`);

// HEAD it to confirm it's reachable (same preflight our Kling path does)
const head = await fetch(publicUrl, { method: "HEAD" });
console.log(`[${tstr(Date.now())}] HEAD ${head.status} content-type=${head.headers.get("content-type")}`);

const prompt =
  "Slow cinematic dolly forward through a modern luxury hallway, warm daylight catching the wooden floor, gentle depth of field shift.";

// Create the Kling task
const createBody = {
  model: "kling-2.6/image-to-video",
  input: {
    prompt,
    sound: false,
    duration: "5",
    image_urls: [publicUrl],
  },
};

const tCreate0 = Date.now();
console.log(`[${tstr(tCreate0)}] POST /api/v1/jobs/createTask (model=kling-2.6/image-to-video, duration=5)`);
const createRes = await fetch("https://api.kie.ai/api/v1/jobs/createTask", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.KIEAI_API_KEY}`,
  },
  body: JSON.stringify(createBody),
});
const createJson = await createRes.json();
const tCreate1 = Date.now();
console.log(`[${tstr(tCreate1)}] createTask response in ${tCreate1 - tCreate0}ms: code=${createJson.code} msg=${createJson.msg}`);
if (createJson.code !== 200) {
  console.error("createTask failed:", JSON.stringify(createJson, null, 2));
  process.exit(1);
}
const taskId = createJson.data.taskId;
console.log(`taskId=${taskId}`);

// Poll
let attempts = 0;
const pollStart = Date.now();
const deadline = pollStart + 30 * 60 * 1000; // 30 minutes cap for diagnosis
while (Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, 5000));
  attempts++;
  const res = await fetch(
    `https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`,
    { headers: { Authorization: `Bearer ${process.env.KIEAI_API_KEY}` } },
  );
  const json = await res.json();
  const state = json.data?.state;
  const elapsed = Date.now() - pollStart;
  console.log(`[${tstr(Date.now())}] poll #${attempts} state=${state} elapsed=${(elapsed / 1000).toFixed(1)}s`);
  if (state === "success") {
    const resultJson = JSON.parse(json.data.resultJson ?? "{}");
    const urls = resultJson.resultUrls ?? [];
    console.log("\nSUCCESS");
    console.log("  total time:", ((Date.now() - tCreate0) / 1000).toFixed(1), "s (create + poll)");
    console.log("  generation only:", (elapsed / 1000).toFixed(1), "s");
    console.log("  result URLs:", urls);
    process.exit(0);
  }
  if (state === "fail") {
    console.error("\nFAIL");
    console.error("  failMsg:", json.data.failMsg);
    console.error("  failCode:", json.data.failCode);
    process.exit(1);
  }
}
console.error(`\nTIMEOUT after ${attempts} polls (${(Date.now() - pollStart) / 1000}s)`);
process.exit(1);

function tstr(ms) {
  return new Date(ms).toISOString().slice(11, 23);
}
