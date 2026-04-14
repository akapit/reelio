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

const { runs } = await import("@trigger.dev/sdk/v3");

const list = await runs.list({
  taskIdentifier: "generate-video",
  period: "2h",
  limit: 6,
});

let i = 0;
for await (const run of list) {
  i++;
  console.log("\n=== run", i, "===");
  console.log("id:", run.id);
  console.log("status:", run.status);
  console.log("createdAt:", run.createdAt?.toISOString?.() ?? run.createdAt);
  console.log("durationMs:", run.durationMs);
  console.log("tags:", run.tags);
}
console.log("\ntotal runs:", i);
