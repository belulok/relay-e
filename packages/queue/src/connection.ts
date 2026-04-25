import IORedis, { type Redis } from "ioredis";

let cached: Redis | undefined;

/**
 * Singleton Redis connection used by all BullMQ queues / workers in-process.
 * BullMQ requires `maxRetriesPerRequest: null` for the connection passed to
 * Workers (long-poll BLPOP). We share the same connection for queues; BullMQ
 * handles client/subscriber duplication internally.
 */
export function getRedis(): Redis {
  if (cached) return cached;
  const url = process.env.REDIS_URL ?? "redis://localhost:6379";
  cached = new IORedis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
  return cached;
}

export async function closeRedis(): Promise<void> {
  if (cached) {
    await cached.quit();
    cached = undefined;
  }
}
