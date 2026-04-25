import { Queue, QueueEvents } from "bullmq";
import { getRedis } from "../connection.js";

export const QUEUE_NAMES = {
  agentRuns: "relay-e.agent-runs",
  embeddings: "relay-e.embeddings",
  scheduled: "relay-e.scheduled",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

// --- Job payload types ---

export interface AgentRunJob {
  runId: string;
  tenantId: string;
  userId?: string;
  sessionId?: string;
  prompt: string;
  skills: string[];
  modelKey?: string;
}

export interface EmbeddingJob {
  tenantId: string;
  documentId: string;
  chunks: { index: number; content: string }[];
  embeddingModel: string;
}

// --- Queue singletons ---

const queueDefaults = {
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential" as const, delay: 5_000 },
    removeOnComplete: { age: 24 * 60 * 60, count: 1_000 },
    removeOnFail: { age: 7 * 24 * 60 * 60 },
  },
};

let agentRunsQueue: Queue<AgentRunJob> | undefined;
let embeddingsQueue: Queue<EmbeddingJob> | undefined;

export function getAgentRunsQueue(): Queue<AgentRunJob> {
  if (!agentRunsQueue) {
    agentRunsQueue = new Queue<AgentRunJob>(QUEUE_NAMES.agentRuns, {
      connection: getRedis(),
      ...queueDefaults,
    });
  }
  return agentRunsQueue;
}

export function getEmbeddingsQueue(): Queue<EmbeddingJob> {
  if (!embeddingsQueue) {
    embeddingsQueue = new Queue<EmbeddingJob>(QUEUE_NAMES.embeddings, {
      connection: getRedis(),
      ...queueDefaults,
    });
  }
  return embeddingsQueue;
}

export function getQueueEvents(name: QueueName): QueueEvents {
  return new QueueEvents(name, { connection: getRedis() });
}
