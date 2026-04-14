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
const fast = process.argv.includes("--fast");
if (!imagePath) {
  console.error("usage: node scripts/time-seedance-shot.mjs <image-path> [--fast]");
  process.exit(1);
}

const model = fast ? "bytedance/seedance-2-fast" : "bytedance/seedance-2";

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
console.log(`[${tstr(Date.now())}] r2 upload done. url=${publicUrl}`);

const prompt =
  "Slow cinematic dolly forward through a modern luxury hallway, warm daylight catching the wooden floor, gentle depth of field shift, calm upscale real-estate atmosphere.";

// Seedance schema (per kieai.ts): first_frame_url for single i2v, integer
// duration in [4,15], generate_audio false, web_search false.
const createBody = {
  model,
  input: {
    prompt,
    aspect_ratio: "16:9",
    duration: 5,
    resolution: "720p",
    generate_audio: false,
    web_search: false,
    nsfw_checker: false,
    first_frame_url: publicUrl,
  },
};

const tCreate0 = Date.now();
console.log(`[${tstr(tCreate0)}] POST createTask (model=${model}, duration=5)`);
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

let attempts = 0;
const pollStart = Date.now();
const deadline = pollStart + 30 * 60 * 1000;
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
    console.log("  total time:", ((Date.now() - tCreate0) / 1000).toFixed(1), "s");
    console.log("  generation only:", (elapsed / 1000).toFixed(1), "s");
    console.log("  result URLs:", urls);
    process.exit(0);
  }
  if (state === "fail") {
    console.error("\nFAIL");
    console.error("  failMsg:", json.data.failMsg);
    process.exit(1);
  }
}
console.error(`\nTIMEOUT after ${attempts} polls (${(Date.now() - pollStart) / 1000}s)`);
process.exit(1);

function tstr(ms) {
  return new Date(ms).toISOString().slice(11, 23);
}
