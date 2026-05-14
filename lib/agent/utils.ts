import type { PhaseKind } from "@/lib/types";

export function extractPhaseBlocks(
  text: string,
): Array<{ kind: PhaseKind; title: string; content: string; citations: string[] }> {
  const blocks: Array<{ kind: PhaseKind; title: string; content: string; citations: string[] }> = [];
  const regex = /<phase>([\s\S]*?)<\/phase>/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim()) as {
        kind?: string;
        title?: string;
        content?: string;
        citations?: unknown[];
      };
      if (parsed.kind && parsed.title && parsed.content) {
        blocks.push({
          kind: parsed.kind as PhaseKind,
          title: String(parsed.title),
          content: String(parsed.content),
          citations: Array.isArray(parsed.citations) ? parsed.citations.map(String) : [],
        });
      }
    } catch {
      // skip malformed phase blocks
    }
  }
  return blocks;
}

export async function doFetch(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Stipend-Verifier/1.0" },
      signal: AbortSignal.timeout(15000),
    }).catch(() => null);

    let content = "";
    if (res && res.ok) {
      const html = await res.text();
      content = html
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 6000);
    }

    if (!content || content.includes("Cloudflare") || content.includes("Enable JavaScript") || content.includes("Request blocked")) {
      return `[Content blocked or unreachable for ${url}]`;
    }

    return content;
  } catch (error) {
    console.error(`[Verifier Error]`, error);
    return `[Fetch error: ${error instanceof Error ? error.message : "unknown"}]`;
  }
}
