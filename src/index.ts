import { app } from "./slack/app";
import { registerHandlers } from "./slack/handlers";
import { initCache, startPeriodicSync, stopPeriodicSync } from "./notion/cache";

async function main(): Promise<void> {
  // 1. Load file cache for immediate responses
  initCache();

  // 2. Register Slack event handlers
  registerHandlers();

  // 3. Start Bolt app (Socket Mode)
  await app.start();
  console.log("[bot] Slack bot is running (Socket Mode)");

  // 4. Start periodic Notion sync (immediate first sync + interval)
  startPeriodicSync();

  // 5. Graceful shutdown
  const shutdown = async () => {
    console.log("\n[bot] Shutting down...");
    stopPeriodicSync();
    await app.stop();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("[bot] Fatal error:", err);
  process.exit(1);
});
