import type { ErrorHandler } from "hono";
import { EngineError, errors as makeErrors, logger } from "@relay-e/shared";

export const errorHandler: ErrorHandler = (err, c) => {
  const requestId = c.get("requestId");
  if (err instanceof EngineError) {
    logger.warn({ requestId, code: err.code, type: err.type }, err.message);
    return c.json(err.toJSON(requestId), err.status as 400);
  }
  logger.error({ requestId, err }, "unhandled_error");
  const internal = makeErrors.internal(err instanceof Error ? err.message : "internal_error");
  return c.json(internal.toJSON(requestId), 500);
};
