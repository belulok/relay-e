export type ErrorType =
  | "invalid_request_error"
  | "authentication_error"
  | "permission_error"
  | "not_found_error"
  | "rate_limit_error"
  | "tenant_quota_error"
  | "provider_error"
  | "tool_execution_error"
  | "context_error"
  | "internal_error";

export interface SerializedError {
  type: ErrorType;
  code: string;
  message: string;
  request_id?: string;
  doc_url?: string;
  details?: Record<string, unknown>;
}

export class EngineError extends Error {
  readonly type: ErrorType;
  readonly code: string;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(opts: {
    type: ErrorType;
    code: string;
    message: string;
    status?: number;
    details?: Record<string, unknown>;
  }) {
    super(opts.message);
    this.name = "EngineError";
    this.type = opts.type;
    this.code = opts.code;
    this.status = opts.status ?? defaultStatusFor(opts.type);
    this.details = opts.details;
  }

  toJSON(requestId?: string): { error: SerializedError } {
    return {
      error: {
        type: this.type,
        code: this.code,
        message: this.message,
        request_id: requestId,
        details: this.details,
      },
    };
  }
}

function defaultStatusFor(type: ErrorType): number {
  switch (type) {
    case "invalid_request_error":
      return 400;
    case "authentication_error":
      return 401;
    case "permission_error":
      return 403;
    case "not_found_error":
      return 404;
    case "rate_limit_error":
    case "tenant_quota_error":
      return 429;
    case "provider_error":
      return 502;
    case "tool_execution_error":
    case "context_error":
    case "internal_error":
    default:
      return 500;
  }
}

export const errors = {
  invalidRequest: (code: string, message: string, details?: Record<string, unknown>) =>
    new EngineError({ type: "invalid_request_error", code, message, details }),
  unauthorized: (message = "Missing or invalid API key") =>
    new EngineError({ type: "authentication_error", code: "unauthorized", message }),
  notFound: (resource: string) =>
    new EngineError({
      type: "not_found_error",
      code: `${resource}_not_found`,
      message: `${resource} not found`,
    }),
  rateLimit: (message = "Rate limit exceeded") =>
    new EngineError({ type: "rate_limit_error", code: "rate_limited", message }),
  quota: (message = "Tenant quota exceeded") =>
    new EngineError({ type: "tenant_quota_error", code: "quota_exceeded", message }),
  provider: (message: string, details?: Record<string, unknown>) =>
    new EngineError({ type: "provider_error", code: "provider_failure", message, details }),
  tool: (toolName: string, message: string, details?: Record<string, unknown>) =>
    new EngineError({
      type: "tool_execution_error",
      code: "tool_failed",
      message: `Tool ${toolName} failed: ${message}`,
      details,
    }),
  internal: (message = "Internal error") =>
    new EngineError({ type: "internal_error", code: "internal", message }),
};
