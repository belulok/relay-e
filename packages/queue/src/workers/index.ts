import { Worker, type Processor } from "bullmq";
import { getRedis } from "../connection.js";
import { QUEUE_NAMES, type AgentRunJob, type EmbeddingJob } from "../queues/index.js";

export interface WorkerOptions {
  concurrency?: number;
}

export function startAgentRunsWorker(
  processor: Processor<AgentRunJob>,
  opts: WorkerOptions = {},
): Worker<AgentRunJob> {
  return new Worker<AgentRunJob>(QUEUE_NAMES.agentRuns, processor, {
    connection: getRedis(),
    concurrency: opts.concurrency ?? 4,
  });
}

export function startEmbeddingsWorker(
  processor: Processor<EmbeddingJob>,
  opts: WorkerOptions = {},
): Worker<EmbeddingJob> {
  return new Worker<EmbeddingJob>(QUEUE_NAMES.embeddings, processor, {
    connection: getRedis(),
    concurrency: opts.concurrency ?? 8,
  });
}
