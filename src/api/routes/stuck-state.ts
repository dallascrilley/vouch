import { createHash } from "node:crypto";

import type { FastifyInstance } from "fastify";

import { deriveStuckState } from "../../domain/jobs/stuck-state.js";
import { authorizeOperator } from "./runtime-operations.js";

const LEDGER_TAIL_LENGTH = 10;

export function registerStuckStateRoutes(app: FastifyInstance) {
  app.get<{ Params: { jobId: string } }>(
    "/verification-jobs/:jobId/stuck-state",
    async (request, reply) => {
      if (!authorizeOperator(app, request, reply)) {
        return reply;
      }

      const { jobId } = request.params;
      const job = await app.services.jobService.get(jobId);
      if (!job) {
        return reply.code(404).send({ message: "Job not found" });
      }

      const [reviewTasks, ledger, consensus] = await Promise.all([
        app.services.runtimeRepositories.humanReviewTaskRepository.findByJobId(
          jobId
        ),
        app.services.runtimeRepositories.ledgerRepository.listByJobId(jobId),
        app.services.runtimeRepositories.consensusResultRepository.findByJobId(
          jobId
        )
      ]);
      const responsesByTask = await Promise.all(
        reviewTasks.map((task) =>
          app.services.runtimeRepositories.humanResponseRepository.findByReviewTaskId(
            task.reviewTaskId
          )
        )
      );
      const responses = responsesByTask.flat();

      const stuckState = deriveStuckState({
        consensus,
        job,
        ledger,
        responses,
        reviewTasks
      });

      // Only a hash of the sanitized package id is exposed — never raw
      // artifacts or the package itself.
      const latestTask = reviewTasks.at(-1) ?? null;
      const sanitizedPackageHash = latestTask
        ? createHash("sha256")
            .update(latestTask.sanitizedPackageId)
            .digest("hex")
        : null;

      return {
        job_id: job.jobId,
        job_state: job.state,
        stuck: stuckState.stuck,
        stuck_reason: stuckState.stuckReason,
        recommended_next_action: stuckState.recommendedNextAction,
        pairwise_review_task_id: stuckState.pairwiseReviewTaskId,
        ledger_tail: ledger.slice(-LEDGER_TAIL_LENGTH).map((event) => ({
          event_id: event.eventId,
          event_type: event.eventType
        })),
        sanitized_package_hash: sanitizedPackageHash
      };
    }
  );
}
