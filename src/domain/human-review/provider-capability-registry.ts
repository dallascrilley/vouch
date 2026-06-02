import type { ProviderCapabilityProfile } from "./models.js";
import type { ReviewerPoolType } from "../shared/types.js";

export class ProviderCapabilityRegistry {
  constructor(private readonly profiles: ProviderCapabilityProfile[]) {}

  list() {
    return this.profiles;
  }

  findForPool(pool: ReviewerPoolType) {
    return this.profiles.find((profile) => profile.supportedPoolTypes.includes(pool)) ?? null;
  }
}
