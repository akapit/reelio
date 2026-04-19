/**
 * One-off dispatcher for engine-rescue-run. Usage:
 *   npx tsx scripts/rescue-dispatch.ts <runId>
 *
 * Requires TRIGGER_SECRET_KEY in .env.local (auto-loaded).
 */
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local") });

import { tasks } from "@trigger.dev/sdk/v3";

const runId = process.argv[2];
if (!runId) {
  console.error("Usage: npx tsx scripts/rescue-dispatch.ts <runId>");
  process.exit(1);
}

(async () => {
  console.log(`Dispatching engine-rescue-run for runId=${runId}...`);
  const handle = await tasks.trigger("engine-rescue-run", { runId });
  console.log(
    JSON.stringify(
      {
        status: "dispatched",
        triggerRunId: handle.id,
      },
      null,
      2,
    ),
  );
})().catch((err) => {
  console.error("Dispatch failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
