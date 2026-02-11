import { app } from "./app";
import { getPages, syncNow } from "../notion/cache";
import { searchPages } from "../search/relevance";
import { generateAnswer } from "../ai/claude";

function stripMention(text: string): string {
  return text.replace(/<@[A-Z0-9]+>/g, "").trim();
}

function formatSources(
  results: { page: { title: string; url: string } }[]
): string {
  if (results.length === 0) return "";
  const links = results.map((r) => `- <${r.page.url}|${r.page.title}>`);
  return `\n\n:page_facing_up: *출처*\n${links.join("\n")}`;
}

export function registerHandlers(): void {
  app.event("app_mention", async ({ event, say, client }) => {
    const question = stripMention(event.text);
    if (!question) {
      await say({
        text: "질문을 입력해 주세요. 예: `@NotinBot 연차 신청 방법`",
        thread_ts: event.ts,
      });
      return;
    }

    // Send a loading message first
    const loading = await say({
      text: ":hourglass_flowing_sand: 확인중...",
      thread_ts: event.ts,
    });

    try {
      const pages = getPages();
      if (pages.length === 0) {
        await client.chat.update({
          channel: event.channel,
          ts: loading.ts!,
          text: "아직 노션 데이터가 동기화되지 않았습니다. 잠시 후 다시 시도해 주세요.",
        });
        return;
      }

      const results = searchPages(question, pages);
      const answer = await generateAnswer(question, results);
      const sources = formatSources(results);

      await client.chat.update({
        channel: event.channel,
        ts: loading.ts!,
        text: answer + sources,
      });
    } catch (err) {
      console.error("[handler] Error processing mention:", err);
      await client.chat.update({
        channel: event.channel,
        ts: loading.ts!,
        text: "답변 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
      });
    }
  });

  app.command("/sync", async ({ ack, respond }) => {
    await ack();
    await respond("노션 동기화를 시작합니다...");

    try {
      const count = await syncNow();
      await respond(`동기화 완료! ${count}개 페이지가 캐시되었습니다.`);
    } catch (err) {
      console.error("[handler] Sync command failed:", err);
      await respond("동기화 중 오류가 발생했습니다.");
    }
  });
}
