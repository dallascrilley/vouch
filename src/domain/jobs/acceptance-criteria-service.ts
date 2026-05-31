import type { AcceptanceCriterion } from "./models.js";

export class AcceptanceCriteriaService {
  validate(criteria: AcceptanceCriterion[]) {
    if (criteria.length === 0) {
      throw new Error("At least one acceptance criterion is required");
    }

    for (const criterion of criteria) {
      if (!criterion.humanVisibleText.trim()) {
        throw new Error(`Criterion ${criterion.criterionId} must have human-visible text`);
      }

      if (criterion.evidenceRequirements.length === 0) {
        throw new Error(`Criterion ${criterion.criterionId} must define evidence requirements`);
      }
    }
  }
}
