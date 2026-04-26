import { z } from "zod";
import { errors } from "@relay-e/shared";
import { defineTool, type AnyToolDefinition } from "../tools/index.js";
import { resolveEnvString } from "./env.js";
import type { Connector, HttpConnectorConfig } from "./types.js";

interface OpenApiPathSummary {
  method: string;
  path: string;
  summary?: string;
}

/**
 * HTTP connector. Wraps any REST API behind a single base URL.
 *
 * - On boot, optionally fetches an OpenAPI spec to surface endpoint
 *   summaries in the system prompt (so the LLM knows what's callable
 *   without us hardcoding domain logic).
 * - Generates one tool: `call_<id>` (e.g. `call_stripe`) that invokes
 *   any path on the configured base URL.
 * - Auth is resolved from env vars per request — secrets never sit in
 *   the JSON config file.
 */
export class HttpConnector implements Connector {
  readonly type = "http" as const;
  readonly id: string;
  readonly name: string;
  readonly description?: string;

  private readonly cfg: HttpConnectorConfig;
  private endpointSummary?: OpenApiPathSummary[];

  constructor(id: string, name: string, cfg: HttpConnectorConfig) {
    this.id = id;
    this.name = name;
    this.description = cfg.description;
    this.cfg = cfg;

    if (!cfg.baseUrl) {
      throw errors.invalidRequest(
        "connector_misconfigured",
        `HTTP connector "${id}" has no baseUrl`,
      );
    }
  }

  private async fetchOpenApiEndpoints(): Promise<OpenApiPathSummary[]> {
    if (!this.cfg.openApiUrl) return [];
    if (this.endpointSummary) return this.endpointSummary;

    try {
      const res = await fetch(this.cfg.openApiUrl);
      if (!res.ok) return [];
      const spec = (await res.json()) as {
        paths?: Record<string, Record<string, { summary?: string }>>;
      };
      const out: OpenApiPathSummary[] = [];
      for (const [path, methods] of Object.entries(spec.paths ?? {})) {
        for (const [method, op] of Object.entries(methods ?? {})) {
          if (!["get", "post", "put", "patch", "delete"].includes(method)) continue;
          out.push({
            method: method.toUpperCase(),
            path,
            summary: op.summary,
          });
        }
      }
      this.endpointSummary = out;
      return out;
    } catch {
      return [];
    }
  }

  async getPromptContext(): Promise<string> {
    const lines: string[] = [
      `### HTTP connector: \`${this.id}\` (${this.name})`,
    ];
    if (this.description) lines.push(`_${this.description}_`);
    lines.push(`Base URL: \`${this.cfg.baseUrl}\``);

    let endpoints: OpenApiPathSummary[] = this.cfg.endpoints ?? [];
    if (endpoints.length === 0) {
      endpoints = await this.fetchOpenApiEndpoints();
    }
    if (endpoints.length > 0) {
      const surface = endpoints
        .slice(0, 80) // cap at 80 endpoints to bound prompt size
        .map((e) => `  - ${e.method} ${e.path}${e.summary ? ` — ${e.summary}` : ""}`)
        .join("\n");
      lines.push(`Endpoints (use \`call_${this.id}\`):\n${surface}`);
      if (endpoints.length > 80) {
        lines.push(`_(${endpoints.length - 80} more endpoints not shown — query the OpenAPI spec for details.)_`);
      }
    } else {
      lines.push(
        `No endpoint catalogue available for this API; you can call any path on the base URL via \`call_${this.id}\`. ` +
          `When in doubt, ask the user for the endpoint shape.`,
      );
    }
    return lines.join("\n\n");
  }

  async tools(): Promise<AnyToolDefinition[]> {
    const allowedMethods = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

    return [
      defineTool({
        name: `call_${this.id}`,
        description:
          `Make an HTTP request against the "${this.name}" API. ` +
          (this.description ? `${this.description} ` : "") +
          `The base URL is ${this.cfg.baseUrl}. ` +
          `Provide a method and path; optionally body (for POST/PUT/PATCH) and query parameters.`,
        inputSchema: z.object({
          method: z.enum(allowedMethods).default("GET"),
          path: z
            .string()
            .min(1)
            .describe('Path including leading slash, e.g. "/users/42/orders"'),
          query: z
            .record(z.union([z.string(), z.number(), z.boolean()]))
            .optional()
            .describe("Query parameters as a flat key/value object."),
          body: z.unknown().optional().describe(
            "JSON-serialisable request body for POST/PUT/PATCH.",
          ),
        }),
        execute: async ({ method, path, query, body }, ctx) => {
          const url = new URL(this.cfg.baseUrl.replace(/\/$/, "") + (path.startsWith("/") ? path : `/${path}`));
          if (query) {
            for (const [k, v] of Object.entries(query)) {
              url.searchParams.set(k, String(v));
            }
          }

          const headers: Record<string, string> = {
            accept: "application/json",
          };
          if (body && method !== "GET") {
            headers["content-type"] = "application/json";
          }

          // Resolve auth at call time — secrets never live in the JSON file.
          const auth = this.cfg.auth;
          if (auth && auth.type !== "none") {
            if (auth.type === "bearer" && auth.tokenEnv) {
              const token = process.env[auth.tokenEnv];
              if (token) headers.authorization = `Bearer ${token}`;
            } else if (auth.type === "basic" && auth.username && auth.passwordEnv) {
              const password = process.env[auth.passwordEnv];
              if (password) {
                headers.authorization = `Basic ${Buffer.from(`${auth.username}:${password}`).toString("base64")}`;
              }
            } else if (auth.type === "header" && auth.headerName && auth.headerValueEnv) {
              const value = resolveEnvString(`\${${auth.headerValueEnv}}`);
              if (value) headers[auth.headerName.toLowerCase()] = value;
            }
          }

          ctx.logger.info(
            { connector: this.id, method, url: url.toString() },
            "http_call",
          );
          try {
            const res = await fetch(url, {
              method,
              headers,
              body: body && method !== "GET" ? JSON.stringify(body) : undefined,
              signal: ctx.signal,
            });
            const text = await res.text();
            const data: unknown = (() => {
              try {
                return JSON.parse(text);
              } catch {
                return text;
              }
            })();
            return {
              status: res.status,
              ok: res.ok,
              body: data,
            };
          } catch (err) {
            return { error: (err as Error).message };
          }
        },
      }),
    ];
  }

  async dispose(): Promise<void> {
    /* nothing to clean */
  }
}
