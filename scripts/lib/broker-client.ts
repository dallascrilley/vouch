/**
 * Unified broker client: HTTP or in-process transport plus primitive API wrappers.
 * Workflow helpers live in runSelfVerificationGate (verify gate) and requestHumanReview (HITL).
 */

export {
  connectBrokerTransport,
  expectStatus,
  HttpBrokerTransport,
  InProcessBrokerTransport,
  type BrokerTransport,
  type TransportResponse
} from "./broker-transport.js";

export {
  BrokerClient,
  type Confidence,
  type CriterionStatus,
  type Criticality,
  type Feedback,
  type GateCheckResult,
  type GateCriterion,
  type GateSource,
  type RecommendedAction,
  type ReleaseArtifact,
  type Verdict
} from "./broker-gate.js";

export {
  requestHumanReview,
  screenshotToVisualEvidence,
  waitForFeedback,
  type AgentFeedback,
  type HumanReviewRequestResult,
  type RequestHumanReviewOptions,
  type ReviewCriterion,
  type ReviewScreenshot
} from "./agent-review-client.js";

export { printReviewCliHelp } from "./review-cli-help.js";
