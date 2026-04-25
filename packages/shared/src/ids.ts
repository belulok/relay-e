import { randomBytes, randomUUID } from "node:crypto";

export function newId(prefix: string): string {
  return `${prefix}_${randomBytes(12).toString("base64url")}`;
}

export const ids = {
  request: () => newId("req"),
  session: () => newId("ses"),
  message: () => newId("msg"),
  run: () => newId("run"),
  tool: () => newId("tool"),
  skill: () => newId("skl"),
  toolCall: () => newId("tc"),
  user: () => newId("usr"),
  tenant: () => newId("ten"),
  uuid: () => randomUUID(),
};
