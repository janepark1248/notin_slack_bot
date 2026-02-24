# Socket Reconnection Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 소켓이 끊겼을 때 자동으로 재연결하도록 이벤트 기반 + 주기적 헬스체크 로직을 추가한다.

**Architecture:** `app.error()` 핸들러로 끊김 이벤트를 즉시 감지해 재연결하고, `setInterval`로 4시간마다 강제 재연결해 이벤트 누락 케이스를 커버한다. `isReconnecting` 플래그로 동시 재연결을 방지한다.

**Tech Stack:** `@slack/bolt` v4, TypeScript, Node.js `setInterval`

---

### Task 1: config.ts에 reconnectIntervalMs 추가

**Files:**
- Modify: `src/config.ts`

**Step 1: 현재 파일 확인**

```
src/config.ts 읽기 — syncIntervalMs 아래에 추가할 위치 확인
```

**Step 2: reconnectIntervalMs 추가**

`syncIntervalMs` 줄 바로 아래에 추가:

```typescript
reconnectIntervalMs: Number(process.env.RECONNECT_INTERVAL_MS) || 4 * 60 * 60 * 1000, // 4 hours
```

**Step 3: 빌드 확인**

```bash
npx tsc --noEmit
```
Expected: 에러 없음

**Step 4: Commit**

```bash
git add src/config.ts
git commit -m "feat: add reconnectIntervalMs config"
```

---

### Task 2: index.ts에 reconnect() 함수 추가

**Files:**
- Modify: `src/index.ts`

**Step 1: 현재 파일 확인**

```
src/index.ts 읽기 — main() 함수 구조 파악
```

**Step 2: reconnect() 함수 구현**

`main()` 함수 선언 바로 위에 다음 코드 추가:

```typescript
let isReconnecting = false;

async function reconnect(attempt = 1): Promise<void> {
  if (isReconnecting) return;
  isReconnecting = true;
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
      setTimeout(() => {
        isReconnecting = false;
        reconnect(attempt + 1);
      }, 5000);
    } else {
      console.error("[bot] All reconnect attempts failed. Giving up.");
      isReconnecting = false;
    }
  }
}
```

**Step 3: 빌드 확인**

```bash
npx tsc --noEmit
```
Expected: 에러 없음

---

### Task 3: app.error() 핸들러 + setInterval 헬스체크 추가

**Files:**
- Modify: `src/index.ts`

**Step 1: app.error() 핸들러 추가**

`main()` 함수 안, `await app.start();` 줄 바로 위에 추가:

```typescript
app.error(async (error) => {
  console.error("[bot] Slack app error:", error);
  await reconnect();
});
```

**Step 2: 헬스체크 인터벌 추가**

`startPeriodicSync();` 줄 바로 아래에 추가:

```typescript
const healthCheckTimer = setInterval(async () => {
  if (!isReconnecting) {
    console.log("[bot] Periodic socket reconnect (health check)...");
    await reconnect();
  }
}, config.reconnectIntervalMs);
```

**Step 3: shutdown() 에서 인터벌 정리**

기존 `shutdown` 함수 안 `stopPeriodicSync();` 바로 위에 추가:

```typescript
clearInterval(healthCheckTimer);
```

**Step 4: 빌드 확인**

```bash
npx tsc --noEmit
```
Expected: 에러 없음

**Step 5: Commit**

```bash
git add src/index.ts
git commit -m "feat: add socket reconnection with error handler and health check"
```

---

### Task 4: 동작 확인

**Step 1: 빌드 후 실행**

```bash
npm run dev
```
Expected: `[bot] Slack bot is running (Socket Mode)` 출력

**Step 2: 로그 확인 포인트**

- 소켓 오류 발생 시: `[bot] Slack app error:` → `[bot] Reconnecting socket (attempt 1)...` → `[bot] Socket reconnected successfully`
- 4시간마다: `[bot] Periodic socket reconnect (health check)...`
- 재시도 실패 시: `[bot] Reconnect attempt N failed:`

**Step 3: 최종 Commit (필요 시)**

```bash
git add -p
git commit -m "chore: verify socket reconnection works"
```
