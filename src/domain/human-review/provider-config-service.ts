import type { ProviderAdapterConfig } from "./models.js";
import type { ProviderConfigRepository } from "../../adapters/storage/repositories.js";
import {
  buildLocalProviderValidationProfile,
  validateProviderConfig
} from "../../config/provider-config.js";

export class ProviderConfigService {
  constructor(private readonly configRepository: ProviderConfigRepository) {}

  async get(providerId: string) {
    return this.configRepository.get(providerId);
  }

  async save(config: ProviderAdapterConfig) {
    await this.configRepository.save(config);
    return config;
  }

  async validate(providerId: string) {
    const config = await this.configRepository.get(providerId);
    if (!config) {
      throw new Error(`Provider config not found: ${providerId}`);
    }

    return {
      config,
      profile: buildLocalProviderValidationProfile(config),
      validation: validateProviderConfig(config)
    };
  }
}
