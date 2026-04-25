import type { MiddlewareHandler } from "hono";
import { ids } from "@relay-e/shared";

export const requestIdMiddleware: MiddlewareHandler = async (c, next) => {
  const incoming = c.req.header("x-request-id");
  const id = incoming ?? ids.request();
  c.set("requestId", id);
  c.header("x-request-id", id);
  await next();
};
