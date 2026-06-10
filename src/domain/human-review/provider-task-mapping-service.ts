import type {
  ProviderResponseReceipt,
  ProviderTaskMapping,
  ProviderTaskMappingStatus
} from "./models.js";
import type {
  ProviderResponseReceiptRepository,
  ProviderTaskMappingRepository
} from "../../adapters/storage/repositories.js";

export class ProviderTaskMappingService {
  constructor(
    private readonly mappingRepository: ProviderTaskMappingRepository,
    private readonly receiptRepository: ProviderResponseReceiptRepository
  ) {}

  async createMapping(input: Omit<ProviderTaskMapping, "createdAt" | "updatedAt">) {
    const mapping: ProviderTaskMapping = {
      ...input,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    await this.mappingRepository.save(mapping);
    return mapping;
  }

  async markStatus(reviewTaskId: string, status: ProviderTaskMappingStatus) {
    const mapping = await this.mappingRepository.findByReviewTaskId(reviewTaskId);
    if (!mapping) {
      throw new Error(`Provider task mapping not found: ${reviewTaskId}`);
    }

    const next: ProviderTaskMapping = {
      ...mapping,
      dispatchStatus: status,
      updatedAt: new Date()
    };
    await this.mappingRepository.save(next);
    return next;
  }

  async findByProviderTaskId(providerTaskId: string) {
    return this.mappingRepository.findByProviderTaskId(providerTaskId);
  }

  async recordReceipt(
    receipt: ProviderResponseReceipt
  ): Promise<{ receipt: ProviderResponseReceipt; deduplicated: boolean }> {
    const existing = await this.receiptRepository.findByDedupeKey(receipt.dedupeKey);
    if (existing) {
      return { receipt: existing, deduplicated: true };
    }

    await this.receiptRepository.save(receipt);
    return { receipt, deduplicated: false };
  }
}
