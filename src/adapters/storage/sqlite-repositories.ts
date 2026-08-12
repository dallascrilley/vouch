export { SQLiteRuntimeStore } from "./sqlite-runtime-store.js";
export {
  SQLiteAcceptanceCriterionRepository,
  SQLiteArtifactManifestRepository,
  SQLitePrivacyClassificationRepository,
  SQLiteSelfVerificationResultRepository,
  SQLiteVerificationJobRepository
} from "./sqlite-job-repositories.js";
export {
  SQLiteAdjudicationCaseRepository,
  SQLiteConsensusResultRepository,
  SQLiteHumanResponseRepository,
  SQLiteHumanReviewTaskRepository
} from "./sqlite-review-repositories.js";
export {
  SQLiteAgentFeedbackRepository,
  SQLiteFinalVerdictRepository,
  SQLiteVerdictLedgerRepository
} from "./sqlite-verdict-repositories.js";
export {
  SQLiteLocalQueueStore,
  type LocalQueueClaim
} from "./sqlite-local-queue-store.js";

import {
  SQLiteAcceptanceCriterionRepository,
  SQLiteArtifactManifestRepository,
  SQLitePrivacyClassificationRepository,
  SQLiteSelfVerificationResultRepository,
  SQLiteVerificationJobRepository
} from "./sqlite-job-repositories.js";
import {
  SQLiteAdjudicationCaseRepository,
  SQLiteConsensusResultRepository,
  SQLiteHumanResponseRepository,
  SQLiteHumanReviewTaskRepository
} from "./sqlite-review-repositories.js";
import { SQLiteRuntimeStore } from "./sqlite-runtime-store.js";
import {
  SQLiteAgentFeedbackRepository,
  SQLiteFinalVerdictRepository,
  SQLiteVerdictLedgerRepository
} from "./sqlite-verdict-repositories.js";

export type SQLiteRuntimeRepositories = {
  acceptanceCriterionRepository: SQLiteAcceptanceCriterionRepository;
  adjudicationCaseRepository: SQLiteAdjudicationCaseRepository;
  artifactManifestRepository: SQLiteArtifactManifestRepository;
  consensusResultRepository: SQLiteConsensusResultRepository;
  feedbackRepository: SQLiteAgentFeedbackRepository;
  finalVerdictRepository: SQLiteFinalVerdictRepository;
  humanResponseRepository: SQLiteHumanResponseRepository;
  humanReviewTaskRepository: SQLiteHumanReviewTaskRepository;
  jobRepository: SQLiteVerificationJobRepository;
  ledgerRepository: SQLiteVerdictLedgerRepository;
  privacyClassificationRepository: SQLitePrivacyClassificationRepository;
  selfVerificationResultRepository: SQLiteSelfVerificationResultRepository;
  store: SQLiteRuntimeStore;
};

export function createSQLiteRuntimeRepositories(
  databasePath: string
): SQLiteRuntimeRepositories {
  const store = new SQLiteRuntimeStore(databasePath);

  return {
    acceptanceCriterionRepository: new SQLiteAcceptanceCriterionRepository(
      store
    ),
    adjudicationCaseRepository: new SQLiteAdjudicationCaseRepository(store),
    artifactManifestRepository: new SQLiteArtifactManifestRepository(store),
    consensusResultRepository: new SQLiteConsensusResultRepository(store),
    feedbackRepository: new SQLiteAgentFeedbackRepository(store),
    finalVerdictRepository: new SQLiteFinalVerdictRepository(store),
    humanResponseRepository: new SQLiteHumanResponseRepository(store),
    humanReviewTaskRepository: new SQLiteHumanReviewTaskRepository(store),
    jobRepository: new SQLiteVerificationJobRepository(store),
    ledgerRepository: new SQLiteVerdictLedgerRepository(store),
    privacyClassificationRepository: new SQLitePrivacyClassificationRepository(
      store
    ),
    selfVerificationResultRepository:
      new SQLiteSelfVerificationResultRepository(store),
    store
  };
}
