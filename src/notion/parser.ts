type RichText = { plain_text: string };

function extractText(richTexts: RichText[] | undefined): string {
  if (!richTexts) return "";
  return richTexts.map((t) => t.plain_text).join("");
}

export function parseBlocks(blocks: any[]): string {
  const lines: string[] = [];

  for (const block of blocks) {
    const type = block.type;
    const data = block[type];
    if (!data) continue;

    switch (type) {
      case "paragraph":
        lines.push(extractText(data.rich_text));
        break;

      case "heading_1":
        lines.push(`# ${extractText(data.rich_text)}`);
        break;

      case "heading_2":
        lines.push(`## ${extractText(data.rich_text)}`);
        break;

      case "heading_3":
        lines.push(`### ${extractText(data.rich_text)}`);
        break;

      case "bulleted_list_item":
        lines.push(`- ${extractText(data.rich_text)}`);
        break;

      case "numbered_list_item":
        lines.push(`1. ${extractText(data.rich_text)}`);
        break;

      case "to_do":
        const checked = data.checked ? "x" : " ";
        lines.push(`[${checked}] ${extractText(data.rich_text)}`);
        break;

      case "toggle":
        lines.push(`> ${extractText(data.rich_text)}`);
        break;

      case "quote":
        lines.push(`> ${extractText(data.rich_text)}`);
        break;

      case "code":
        lines.push(`\`\`\`\n${extractText(data.rich_text)}\n\`\`\``);
        break;

      case "callout":
        lines.push(extractText(data.rich_text));
        break;

      case "divider":
        lines.push("---");
        break;

      case "table_row":
        if (data.cells) {
          const row = data.cells
            .map((cell: RichText[]) => extractText(cell))
            .join(" | ");
          lines.push(row);
        }
        break;

      case "child_page":
        // child pages are crawled separately
        break;

      default:
        if (data.rich_text) {
          lines.push(extractText(data.rich_text));
        }
        break;
    }
  }

  return lines.filter((l) => l.length > 0).join("\n");
}
