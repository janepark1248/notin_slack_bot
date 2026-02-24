import { app } from "./slack/app";
import { registerHandlers } from "./slack/handlers";
import { initCache, startPeriodicSync, stopPeriodicSync } from "./notion/cache";
import { config } from "./config";

let isReconnecting = false;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function reconnectWithRetry(attempt: number): Promise<void> {
  console.log(`[bot] Reconnecting socket (attempt ${attempt})...`);

  try {
    await app.stop();
  } catch (err) {
    console.error("[bot] Error stopping app during reconnect:", err);
  }

  try {
    await app.start();
    console.log("[bot] Socket reconnected successfully");
    isReconnecting = false;
  } catch (err) {
    console.error(`[bot] Reconnect attempt ${attempt} failed:`, err);
    if (attempt < 3) {
      await delay(5000);
      return reconnectWithRetry(attempt + 1);
    } else {
      console.error("[bot] All reconnect attempts failed. Giving up.");
      isReconnecting = false;
    }
  }
}

async function reconnect(): Promise<void> {
  if (isReconnecting) return;
  isReconnecting = true;
  await reconnectWithRetry(1);
}

async function main(): Promise<void> {
  // 1. Load file cache for immediate responses
  initCache();

  // 2. Register Slack event handlers
  registerHandlers();

  // 3. Register error handler for automatic socket reconnection
  app.error(async (error) => {
    console.error("[bot] Slack app error:", error);
    await reconnect();
  });

  // 4. Start Bolt app (Socket Mode)
  await app.start();
  console.log("[bot] Slack bot is running (Socket Mode)");

  // 5. Start periodic Notion sync (immediate first sync + interval)
  startPeriodicSync();

  // 6. Periodic socket health check
  const healthCheckTimer = setInterval(() => {
    if (!isReconnecting) {
      console.log("[bot] Periodic socket reconnect...");
      reconnect().catch((err) => {
        console.error("[bot] Periodic reconnect error:", err);
      });
    }
  }, config.reconnectIntervalMs);

  // 7. Graceful shutdown
  const shutdown = async () => {
    console.log("\n[bot] Shutting down...");
    clearInterval(healthCheckTimer);
    stopPeriodicSync();
    try {
      await app.stop();
    } catch (err) {
      console.error("[bot] Error during shutdown:", err);
    }
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("[bot] Fatal error:", err);
  process.exit(1);
});
