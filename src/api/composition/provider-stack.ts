import { RealProviderAdapter } from "../../adapters/providers/real-provider-adapter.js";
import {
  SQLiteProviderResponseReceiptRepository,
  SQLiteProviderStateStore,
  SQLiteProviderTaskMappingRepository
} from "../../adapters/storage/provider-sqlite-repositories.js";
import type {
  ProviderConfigRepository,
  ProviderResponseReceiptRepository,
  ProviderTaskMappingRepository
} from "../../adapters/storage/repositories.js";
import type { SQLiteRuntimeRepositories } from "../../adapters/storage/sqlite-repositories.js";
import type { TransactionManager } from "../../adapters/storage/transaction-manager.js";
import { buildDefaultProviderHealthStates } from "../../config/policies.js";
import { loadDefaultProviderConfig } from "../../config/policies.js";
import { validateProviderConfig } from "../../config/provider-config.js";
import type { RuntimeConfig } from "../../config/runtime.js";
import type {
  ProviderAdapterConfig,
  ProviderResponseReceipt,
  ProviderTaskMapping
} from "../../domain/human-review/models.js";
import { ProviderConfigService } from "../../domain/human-review/provider-config-service.js";
import { ProviderOperationsService } from "../../domain/human-review/provider-operations-service.js";
import { ProviderResponseService } from "../../domain/human-review/provider-response-service.js";
import { ProviderTaskMappingService } from "../../domain/human-review/provider-task-mapping-service.js";
import { ProviderWorkflowService } from "../../domain/human-review/provider-workflow-service.js";
import { ProviderDispatchWorker } from "../../workers/provider-dispatch-worker.js";
import type { DomainServices } from "./domain-services.js";

class InMemoryProviderConfigRepository implements ProviderConfigRepository {
  constructor(
    private readonly configs = new Map<string, ProviderAdapterConfig>()
  ) {}

  get(providerId: string) {
    return Promise.resolve(this.configs.get(providerId) ?? null);
  }

  save(config: ProviderAdapterConfig) {
    this.configs.set(config.providerId, config);
    return Promise.resolve();
  }
}

class InMemoryProviderTaskMappingRepository implements ProviderTaskMappingRepository {
  private readonly mappings = new Map<string, ProviderTaskMapping>();
  private readonly taskIds = new Map<string, string>();

  findByProviderTaskId(providerTaskId: string) {
    const reviewTaskId = this.taskIds.get(providerTaskId);
    return Promise.resolve(
      reviewTaskId ? (this.mappings.get(reviewTaskId) ?? null) : null
    );
  }

  findByReviewTaskId(reviewTaskId: string) {
    return Promise.resolve(this.mappings.get(reviewTaskId) ?? null);
  }

  save(mapping: ProviderTaskMapping) {
    this.mappings.set(mapping.reviewTaskId, mapping);
    this.taskIds.set(mapping.providerTaskId, mapping.reviewTaskId);
    return Promise.resolve();
  }
}

class InMemoryProviderResponseReceiptRepository implements ProviderResponseReceiptRepository {
  private readonly receipts = new Map<string, ProviderResponseReceipt>();

  findByDedupeKey(dedupeKey: string) {
    return Promise.resolve(this.receipts.get(dedupeKey) ?? null);
  }

  save(receipt: ProviderResponseReceipt) {
    this.receipts.set(receipt.dedupeKey, receipt);
    return Promise.resolve();
  }
}

type ProviderStores = {
  mappingRepository: ProviderTaskMappingRepository;
  receiptRepository: ProviderResponseReceiptRepository;
  close: () => void;
};

/**
 * Selects where provider task mappings and response receipts live.
 *
 * This is the memory-vs-sqlite decision issue #2 asked to be made findable:
 * a single `providerStateDbPath` check, one store, and both repositories on
 * the same side of it. Without a path there is nothing to close.
 */
function createProviderStores(config: RuntimeConfig): ProviderStores {
  if (!config.providerStateDbPath) {
    return {
      mappingRepository: new InMemoryProviderTaskMappingRepository(),
      receiptRepository: new InMemoryProviderResponseReceiptRepository(),
      close: () => undefined
    };
  }

  const stateStore = new SQLiteProviderStateStore(config.providerStateDbPath);
  return {
    mappingRepository: new SQLiteProviderTaskMappingRepository(stateStore),
    receiptRepository: new SQLiteProviderResponseReceiptRepository(stateStore),
    close: () => stateStore.close()
  };
}

export type ProviderStack = {
  providerConfig: ProviderAdapterConfig;
  providerConfigService: ProviderConfigService;
  providerDispatchWorker?: ProviderDispatchWorker;
  providerMappingService: ProviderTaskMappingService;
  providerOperationsService: ProviderOperationsService;
  providerResponseService: ProviderResponseService;
  providerWorkflowService: ProviderWorkflowService;
  close: () => void;
};

export type ProviderStackInput = {
  config: RuntimeConfig;
  domain: DomainServices;
  env: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  repositories: SQLiteRuntimeRepositories;
  transactionManager: TransactionManager;
};

/**
 * Builds provider configuration, its persistence, and the services that sit on
 * top of it. Throws before constructing anything when the provider config is
 * invalid.
 */
export function createProviderStack({
  config,
  domain,
  env,
  fetchImpl,
  repositories,
  transactionManager
}: ProviderStackInput): ProviderStack {
  const providerConfig = loadDefaultProviderConfig(env);
  const providerValidation = validateProviderConfig(providerConfig);
  if (!providerValidation.valid) {
    throw new Error(providerValidation.errors.join("; "));
  }

  const providerConfigRepository = new InMemoryProviderConfigRepository();
  void providerConfigRepository.save(providerConfig);
  const providerConfigService = new ProviderConfigService(
    providerConfigRepository
  );

  const stores = createProviderStores(config);
  const providerMappingService = new ProviderTaskMappingService(
    stores.mappingRepository,
    stores.receiptRepository
  );
  const providerOperationsService = new ProviderOperationsService(
    buildDefaultProviderHealthStates()
  );
  const providerResponseService = new ProviderResponseService(
    providerMappingService,
    domain.responseValidationService
  );
  const providerWorkflowService = new ProviderWorkflowService(
    domain.jobService,
    domain.ledgerService,
    domain.verdictService,
    domain.feedbackService,
    repositories.humanReviewTaskRepository,
    transactionManager,
    repositories.humanResponseRepository,
    domain.humanReviewTaskService
  );
  const providerDispatchWorker = providerConfig.enabled
    ? new ProviderDispatchWorker(
        new RealProviderAdapter(providerConfig, fetchImpl),
        providerMappingService,
        providerOperationsService,
        providerConfig.providerId
      )
    : undefined;

  return {
    providerConfig,
    providerConfigService,
    providerDispatchWorker,
    providerMappingService,
    providerOperationsService,
    providerResponseService,
    providerWorkflowService,
    close: stores.close
  };
}
