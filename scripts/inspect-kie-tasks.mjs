import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

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

const taskIds = process.argv.slice(2);
if (taskIds.length === 0) {
  console.error("usage: node scripts/inspect-kie-tasks.mjs <taskId> [<taskId>...]");
  process.exit(1);
}

for (const taskId of taskIds) {
  const res = await fetch(
    `https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`,
    { headers: { Authorization: `Bearer ${process.env.KIEAI_API_KEY}` } },
  );
  const text = await res.text();
  console.log(`\n=== taskId: ${taskId} (HTTP ${res.status}) ===`);
  try {
    const json = JSON.parse(text);
    const d = json.data ?? json;
    console.log("state:", d?.state);
    console.log("createTime:", d?.createTime);
    console.log("completeTime:", d?.completeTime);
    console.log("model:", d?.model);
    console.log("failMsg:", d?.failMsg);
    if (d?.param) {
      try {
        const p = typeof d.param === "string" ? JSON.parse(d.param) : d.param;
        console.log("param.duration:", p?.duration);
        console.log("param.prompt (first 160):", String(p?.prompt ?? "").slice(0, 160));
      } catch { console.log("param:", d.param); }
    }
  } catch {
    console.log(text.slice(0, 500));
  }
}
