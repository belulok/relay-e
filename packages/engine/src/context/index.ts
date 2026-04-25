import type { Logger } from "@relay-e/shared";

export interface ContextRequest {
  tenantId: string;
  userId?: string;
  sessionId?: string;
  query: string;
  skills: string[];
  logger: Logger;
  signal: AbortSignal;
}

export interface ContextItem {
  source: string;
  priority: number;
  tokenEstimate: number;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface ContextBundle {
  items: ContextItem[];
  totalTokenEstimate: number;
}

export interface ContextSource {
  name: string;
  // Higher priority items survive when the budget shrinks.
  priority: number;
  fetch(req: ContextRequest): Promise<ContextItem[]>;
}

export class ContextResolver {
  constructor(private readonly sources: ContextSource[]) {}

  async resolve(req: ContextRequest, budgetTokens: number): Promise<ContextBundle> {
    const settled = await Promise.allSettled(
      this.sources.map(async (source) => {
        const fetchedAt = Date.now();
        try {
          const items = await source.fetch(req);
          req.logger.debug(
            { source: source.name, items: items.length, ms: Date.now() - fetchedAt },
            "context_source_ok",
          );
          return items;
        } catch (err) {
          req.logger.warn({ source: source.name, err }, "context_source_failed");
          return [] as ContextItem[];
        }
      }),
    );

    const items = settled
      .flatMap((r) => (r.status === "fulfilled" ? r.value : []))
      .sort((a, b) => b.priority - a.priority);

    // Trim to budget by dropping lowest-priority items first (already sorted desc).
    let used = 0;
    const kept: ContextItem[] = [];
    for (const item of items) {
      if (used + item.tokenEstimate > budgetTokens) continue;
      used += item.tokenEstimate;
      kept.push(item);
    }
    return { items: kept, totalTokenEstimate: used };
  }
}

export function renderContext(bundle: ContextBundle): string {
  if (bundle.items.length === 0) return "";
  const sections = bundle.items.map(
    (item) => `<context source="${item.source}">\n${item.content}\n</context>`,
  );
  return sections.join("\n\n");
}
