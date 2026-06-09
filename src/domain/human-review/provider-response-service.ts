import type { HumanResponse, ProviderResponseReceipt } from "./models.js";
import type { ProviderTaskMappingService } from "./provider-task-mapping-service.js";
import type { ResponseValidationService } from "./response-validation-service.js";

export type ProviderCallbackPayload = {
  criterion_results: Array<{
    criterion_id: string;
    confidence: "low" | "medium" | "high";
    status: "pass" | "fail" | "unclear" | "not_visible";
  }>;
  defect_category: string;
  delivery_mode?: "callback" | "polling";
  evidence_note: string;
  overall_verdict: HumanResponse["overallVerdict"];
  provider_assignment_ref?: string;
  provider_id: string;
  provider_response_id: string;
  provider_task_id: string;
  quality_flags?: string[];
  reviewer_pseudonymous_id: string;
  severity: HumanResponse["severity"];
};

export class ProviderResponseService {
  constructor(
    private readonly mappingService: ProviderTaskMappingService,
    private readonly responseValidationService: ResponseValidationService
  ) {}

  async ingest(payload: ProviderCallbackPayload) {
    const mapping = await this.mappingService.findByProviderTaskId(payload.provider_task_id);
    if (!mapping) {
      throw new Error(`Provider task mapping not found: ${payload.provider_task_id}`);
    }

    // Reconcile the claimed provider identity against the mapping so a caller
    // cannot spoof provenance or escape the dedupe namespace by varying it.
    if (payload.provider_id !== mapping.providerId) {
      throw new Error(
        `Provider id mismatch for task ${payload.provider_task_id}: expected ${mapping.providerId}`
      );
    }

    const dedupeKey = `${payload.provider_id}:${payload.provider_response_id}`;
    const receipt: ProviderResponseReceipt = {
      receiptId: `receipt_${crypto.randomUUID()}`,
      providerId: payload.provider_id,
      providerTaskId: payload.provider_task_id,
      providerResponseId: payload.provider_response_id,
      deliveryMode: payload.delivery_mode ?? "callback",
      receivedAt: new Date(),
      dedupeKey
    };
    const { receipt: storedReceipt, deduplicated } = await this.mappingService.recordReceipt(receipt);

    // Replayed callbacks (same provider_id:provider_response_id) must not be
    // reprocessed — that would create duplicate responses and duplicate ledger
    // transitions. Return the existing receipt without re-recording.
    if (deduplicated) {
      return {
        receipt: storedReceipt,
        response: null,
        reviewTaskId: mapping.reviewTaskId,
        deduplicated: true
      };
    }

    const response: HumanResponse = {
      responseId: `response_${crypto.randomUUID()}`,
      reviewTaskId: mapping.reviewTaskId,
      providerId: payload.provider_id,
      providerResponseId: payload.provider_response_id,
      providerAssignmentRef: payload.provider_assignment_ref ?? mapping.providerAssignmentScope,
      reviewerPseudonymousId: payload.reviewer_pseudonymous_id,
      overallVerdict: payload.overall_verdict,
      criterionResults: payload.criterion_results.map((criterion) => ({
        criterionId: criterion.criterion_id,
        confidence: criterion.confidence,
        status: criterion.status
      })),
      severity: payload.severity,
      defectCategory: payload.defect_category,
      confidence: "high",
      artifactIssueFlags: [],
      evidenceNote: payload.evidence_note,
      annotationRefs: [payload.provider_response_id],
      qualityFlags: payload.quality_flags ?? [],
      submittedAt: new Date()
    };

    await this.responseValidationService.record(response);
    await this.mappingService.markStatus(mapping.reviewTaskId, "normalized");

    return {
      receipt: storedReceipt,
      response,
      reviewTaskId: mapping.reviewTaskId,
      deduplicated: false
    };
  }
}
