import { z } from "zod";
import { errors } from "@relay-e/shared";
import { defineTool, type AnyToolDefinition } from "../tools/index.js";
import type { Connector, WebSearchConnectorConfig } from "./types.js";

interface SearchHit {
  title: string;
  url: string;
  snippet: string;
}

/**
 * Web search connector. Wraps a search provider behind a generic `web_search`
 * tool the LLM can call when it needs current / external info.
 *
 * Supported providers (pick whichever you have a key for):
 *   - Tavily   — https://tavily.com (best LLM-search ergonomics)
 *   - Brave    — https://brave.com/search/api/
 *   - Serper   — https://serper.dev (Google SERP)
 */
export class WebSearchConnector implements Connector {
  readonly type = "websearch" as const;
  readonly id: string;
  readonly name: string;
  readonly description?: string;

  private readonly cfg: WebSearchConnectorConfig;

  constructor(id: string, name: string, cfg: WebSearchConnectorConfig) {
    this.id = id;
    this.name = name;
    this.description = `Live web search via ${cfg.provider}.`;
    this.cfg = cfg;

    const key = process.env[cfg.apiKeyEnv];
    if (!key) {
      throw errors.invalidRequest(
        "connector_misconfigured",
        `Web search connector "${id}" can't find env var "${cfg.apiKeyEnv}"`,
      );
    }
  }

  async getPromptContext(): Promise<string> {
    return [
      `### Web search connector: \`${this.id}\` (${this.name})`,
      `_${this.description}_`,
      `Use \`web_search\` when the user asks about current events, recent ` +
        `releases, prices, or anything outside your training data.`,
    ].join("\n\n");
  }

  async tools(): Promise<AnyToolDefinition[]> {
    return [
      defineTool({
        name: "web_search",
        description:
          `Search the web for current information. Use when you need recent ` +
          `data the model can't otherwise know (news, prices, releases, docs). ` +
          `Returns up to ${this.cfg.maxResults ?? 5} hits with title, URL, and snippet.`,
        inputSchema: z.object({
          query: z.string().min(2).describe("The search query."),
          max_results: z
            .number()
            .int()
            .min(1)
            .max(20)
            .optional()
            .describe("Number of results, default 5."),
        }),
        execute: async ({ query, max_results }, ctx) => {
          const limit = max_results ?? this.cfg.maxResults ?? 5;
          ctx.logger.info(
            { connector: this.id, provider: this.cfg.provider, query },
            "web_search",
          );
          try {
            const hits = await this.search(query, limit, ctx.signal);
            return { count: hits.length, results: hits };
          } catch (err) {
            return { error: (err as Error).message };
          }
        },
      }),
    ];
  }

  private async search(
    query: string,
    limit: number,
    signal: AbortSignal,
  ): Promise<SearchHit[]> {
    const apiKey = process.env[this.cfg.apiKeyEnv];
    if (!apiKey) throw new Error(`missing_api_key:${this.cfg.apiKeyEnv}`);

    switch (this.cfg.provider) {
      case "tavily": {
        const res = await fetch("https://api.tavily.com/search", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            api_key: apiKey,
            query,
            max_results: limit,
            search_depth: "basic",
          }),
          signal,
        });
        if (!res.ok) throw new Error(`tavily_${res.status}`);
        const json = (await res.json()) as {
          results?: { title?: string; url?: string; content?: string }[];
        };
        return (json.results ?? []).slice(0, limit).map((r) => ({
          title: r.title ?? "",
          url: r.url ?? "",
          snippet: r.content ?? "",
        }));
      }
      case "brave": {
        const url = new URL("https://api.search.brave.com/res/v1/web/search");
        url.searchParams.set("q", query);
        url.searchParams.set("count", String(limit));
        const res = await fetch(url, {
          headers: { "x-subscription-token": apiKey, accept: "application/json" },
          signal,
        });
        if (!res.ok) throw new Error(`brave_${res.status}`);
        const json = (await res.json()) as {
          web?: { results?: { title?: string; url?: string; description?: string }[] };
        };
        return (json.web?.results ?? []).slice(0, limit).map((r) => ({
          title: r.title ?? "",
          url: r.url ?? "",
          snippet: r.description ?? "",
        }));
      }
      case "serper": {
        const res = await fetch("https://google.serper.dev/search", {
          method: "POST",
          headers: { "x-api-key": apiKey, "content-type": "application/json" },
          body: JSON.stringify({ q: query, num: limit }),
          signal,
        });
        if (!res.ok) throw new Error(`serper_${res.status}`);
        const json = (await res.json()) as {
          organic?: { title?: string; link?: string; snippet?: string }[];
        };
        return (json.organic ?? []).slice(0, limit).map((r) => ({
          title: r.title ?? "",
          url: r.link ?? "",
          snippet: r.snippet ?? "",
        }));
      }
    }
  }

  async dispose(): Promise<void> {
    /* nothing */
  }
}
