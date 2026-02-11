interface MrkdwnSection {
  type: "section";
  text: { type: "mrkdwn"; text: string };
}

const SECTION_LIMIT = 3000;

/**
 * Convert standard Markdown (from Claude) to Slack mrkdwn format.
 */
export function markdownToMrkdwn(text: string): string {
  let result = text;

  // Preserve code blocks
  const codeBlocks: string[] = [];
  result = result.replace(/```[\s\S]*?```/g, (m) => {
    codeBlocks.push(m);
    return `\x00CB${codeBlocks.length - 1}\x00`;
  });

  // Preserve inline code
  const inlineCodes: string[] = [];
  result = result.replace(/`[^`]+`/g, (m) => {
    inlineCodes.push(m);
    return `\x00IC${inlineCodes.length - 1}\x00`;
  });

  // Headers → bold
  result = result.replace(/^#{1,6}\s+(.+)$/gm, "*$1*");

  // Unordered list markers (before italic conversion to avoid conflicts)
  result = result.replace(/^[ \t]*[-*]\s+/gm, "• ");

  // Bold: **text** or __text__ → *text* (use placeholder to avoid italic clash)
  result = result.replace(/\*\*(.+?)\*\*/g, "\x00B$1\x00E");
  result = result.replace(/__(.+?)__/g, "\x00B$1\x00E");

  // Italic: remaining *text* → _text_
  result = result.replace(/(?<!\w)\*(?!\s)(.+?)(?<!\s)\*(?!\w)/g, "_$1_");

  // Restore bold placeholders → *text*
  result = result.replace(/\x00B([\s\S]*?)\x00E/g, "*$1*");

  // Strikethrough: ~~text~~ → ~text~
  result = result.replace(/~~(.+?)~~/g, "~$1~");

  // Links: [text](url) → <url|text>
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "<$2|$1>");

  // Horizontal rules
  result = result.replace(/^-{3,}$/gm, "───────────────");

  // Restore inline code
  inlineCodes.forEach((code, i) => {
    result = result.replace(`\x00IC${i}\x00`, code);
  });

  // Restore code blocks
  codeBlocks.forEach((block, i) => {
    result = result.replace(`\x00CB${i}\x00`, block);
  });

  return result;
}

/**
 * Build Slack Block Kit blocks from mrkdwn text.
 * Splits into multiple section blocks if text exceeds the 3000-char limit.
 */
export function toBlocks(mrkdwn: string): MrkdwnSection[] {
  if (mrkdwn.length <= SECTION_LIMIT) {
    return [section(mrkdwn)];
  }

  const blocks: MrkdwnSection[] = [];
  let remaining = mrkdwn;

  while (remaining.length > 0) {
    if (remaining.length <= SECTION_LIMIT) {
      blocks.push(section(remaining));
      break;
    }

    // Find a good split point (double newline, then single newline)
    let splitAt = remaining.lastIndexOf("\n\n", SECTION_LIMIT);
    if (splitAt <= 0) splitAt = remaining.lastIndexOf("\n", SECTION_LIMIT);
    if (splitAt <= 0) splitAt = SECTION_LIMIT;

    blocks.push(section(remaining.slice(0, splitAt)));
    remaining = remaining.slice(splitAt).replace(/^\n+/, "");
  }

  return blocks;
}

function section(text: string): MrkdwnSection {
  return {
    type: "section",
    text: { type: "mrkdwn", text },
  };
}
