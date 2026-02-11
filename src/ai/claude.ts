import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config";
import type { SearchResult } from "../types";

const anthropic = new Anthropic({ apiKey: config.anthropic.apiKey });

const SYSTEM_PROMPT = `당신은 회사 내부 QnA 봇입니다. 제공된 노션 문서 컨텍스트만을 기반으로 질문에 답변하세요.

규칙:
- 컨텍스트에 있는 정보만 사용하여 답변하세요.
- 답변은 간결하고 명확하게 작성하세요.
- 컨텍스트에서 답변을 찾을 수 없는 경우, 솔직하게 "해당 내용을 찾을 수 없습니다"라고 안내하세요.
- 답변 마지막에 출처 페이지를 별도로 언급하지 마세요 (시스템이 자동으로 추가합니다).`;

const MAX_CONTEXT_PER_PAGE = 3000;

function buildContext(results: SearchResult[]): string {
  return results
    .map((r) => {
      const content =
        r.page.content.length > MAX_CONTEXT_PER_PAGE
          ? r.page.content.slice(0, MAX_CONTEXT_PER_PAGE) + "..."
          : r.page.content;
      return `[페이지: ${r.page.title}]\n${content}`;
    })
    .join("\n\n---\n\n");
}

export async function generateAnswer(
  question: string,
  results: SearchResult[]
): Promise<string> {
  if (results.length === 0) {
    return "관련된 노션 문서를 찾을 수 없습니다. 질문을 다른 키워드로 다시 시도해 주세요.";
  }

  const context = buildContext(results);

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `[참고 문서]\n${context}\n\n[질문]\n${question}`,
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  return textBlock ? textBlock.text : "답변을 생성하지 못했습니다.";
}
