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

const runId = process.argv[2];
if (!runId) { console.error("usage: node scripts/inspect-run.mjs <runId>"); process.exit(1); }

const { runs } = await import("@trigger.dev/sdk/v3");
const run = await runs.retrieve(runId);

console.log("id:", run.id);
console.log("status:", run.status);
console.log("durationMs:", run.durationMs);
console.log("tags:", run.tags);
console.log("\npayload:");
console.log(JSON.stringify(run.payload, null, 2));
console.log("\noutput:");
console.log(JSON.stringify(run.output, null, 2));
console.log("\nerror:");
console.log(JSON.stringify(run.error, null, 2));
console.log("\nmetadata:");
console.log(JSON.stringify(run.metadata, null, 2));
