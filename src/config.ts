import "dotenv/config";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  slack: {
    botToken: requireEnv("SLACK_BOT_TOKEN"),
    appToken: requireEnv("SLACK_APP_TOKEN"),
    fallbackUserId: process.env.FALLBACK_USER_ID || "",
  },
  notion: {
    token: requireEnv("NOTION_TOKEN"),
    rootPageId: requireEnv("NOTION_ROOT_PAGE_ID"),
  },
  anthropic: {
    apiKey: requireEnv("ANTHROPIC_API_KEY"),
  },
  syncIntervalMs: Number(process.env.SYNC_INTERVAL_MS) || 24 * 24 * 60 * 60 * 1000, // 24 days (must fit 32-bit int max ~24.8 days)
  reconnectIntervalMs: Number(process.env.RECONNECT_INTERVAL_MS) || 4 * 60 * 60 * 1000, // 4 hours
} as const;
