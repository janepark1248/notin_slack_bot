# Socket Reconnection Design

**Date:** 2026-02-24

## Problem

The Slack Socket Mode connection drops irregularly. There is no reconnection logic, so the bot becomes unresponsive after a disconnect.

## Solution: Event-Driven + Periodic Health Check (Approach C)

### Files Changed

- `src/config.ts` — add `reconnectIntervalMs` config
- `src/index.ts` — add `reconnect()` function, error handler, and health check interval

### Components

**`reconnect()` function**
- Guards against concurrent reconnects with `isReconnecting` flag
- Calls `app.stop()` → `app.start()`
- Retries up to 3 times with 5-second delay on failure
- Logs each step

**Event-driven trigger**
- `app.error()` handler detects socket errors and calls `reconnect()` immediately

**Periodic health check (backup)**
- `setInterval` forces reconnect every 4 hours by default
- Covers edge cases where error events are missed
- Configurable via `RECONNECT_INTERVAL_MS` environment variable

**Shutdown cleanup**
- Health check interval cleared in existing `shutdown()` function

### Data Flow

```
Socket error occurs
  → app.error() fires
  → reconnect() called (isReconnecting guard)
  → app.stop() → app.start()
  → retry up to 3x on failure (5s delay each)

Every 4 hours (default)
  → setInterval fires
  → reconnect() called (isReconnecting guard)
  → app.stop() → app.start()

SIGINT / SIGTERM
  → clearInterval(healthCheckTimer)
  → stopPeriodicSync()
  → app.stop()
  → process.exit(0)
```

### Config

| Env Var | Default | Description |
|---|---|---|
| `RECONNECT_INTERVAL_MS` | `14400000` (4h) | Periodic reconnect interval |
