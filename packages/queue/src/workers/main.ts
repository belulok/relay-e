import { logger } from "@relay-e/shared";
import { closeRedis } from "../connection.js";
import { startAgentRunsWorker, startEmbeddingsWorker } from "./index.js";

const log = logger.child({ component: "queue-worker" });

const agentWorker = startAgentRunsWorker(async (job) => {
  log.info({ jobId: job.id, runId: job.data.runId }, "agent_run_received");
  // TODO: wire to runAgent() once the /v1/runs endpoint is in place.
  return { runId: job.data.runId, status: "stub" };
});

const embedWorker = startEmbeddingsWorker(async (job) => {
  log.info(
    { jobId: job.id, documentId: job.data.documentId, chunks: job.data.chunks.length },
    "embedding_job_received",
  );
  // TODO: call embedding provider, write back to document_chunks.
  return { documentId: job.data.documentId, chunks: job.data.chunks.length };
});

for (const w of [agentWorker, embedWorker]) {
  w.on("ready", () => log.info({ name: w.name }, "worker_ready"));
  w.on("failed", (job, err) =>
    log.error({ name: w.name, jobId: job?.id, err }, "worker_job_failed"),
  );
}

async function shutdown() {
  log.info("worker_shutdown_starting");
  await Promise.all([agentWorker.close(), embedWorker.close()]);
  await closeRedis();
  log.info("worker_shutdown_complete");
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

log.info("worker_started — Ctrl+C to stop");
