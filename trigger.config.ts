import { defineConfig } from "@trigger.dev/sdk";
import { config } from "dotenv";

// Load .env.local so env vars are available in Trigger.dev tasks
config({ path: ".env.local" });

export default defineConfig({
  project: "proj_gndlecpwoejuczvgotvr",
  runtime: "node",
  maxDuration: 600,
  dirs: ["./trigger"],
});
