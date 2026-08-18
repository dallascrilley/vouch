import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { FastifyInstance } from "fastify";
import { describe, expect, it } from "vitest";

import { buildApp } from "../../src/api/app.js";

// The composition root is the only place in the codebase that constructs a
// domain service, so the shape of `app.services` is a contract rather than an
// implementation detail. `app.decorate` cannot enforce it at runtime, and
// before this suite existed a service could be decorated without appearing on
// `AppServices` (or vice versa) with no signal at all.
const EXPECTED_SERVICE_KEYS = [
  "adjudicationService",
  "artifactService",
  "consensusService",
  "feedbackRepository",
  "humanReviewTaskService",
  "jobService",
  "metrics",
  "privacyGate",
  "providerConfig",
  "providerConfigService",
  "providerDispatchWorker",
  "providerMappingService",
  "providerOperationsService",
  "providerResponseService",
  "providerWorkflowService",
  "queueStore",
  "responseValidationService",
  "runtimeConfig",
  "runtimeRepositories",
  "selfVerificationService",
  "spendCeiling",
  "transactionManager",
  "verdictRepository"
];

function providerRepositoryNames(app: FastifyInstance) {
  const mappingService = app.services.providerMappingService as unknown as {
    mappingRepository: object;
    receiptRepository: object;
  };
  return {
    mapping: mappingService.mappingRepository.constructor.name,
    receipt: mappingService.receiptRepository.constructor.name
  };
}

describe("composition root", () => {
  it("decorates exactly the services AppServices declares", async () => {
    const app = buildApp({ env: { VITEST: "1" } });
    try {
      expect(Object.keys(app.services).sort()).toEqual(EXPECTED_SERVICE_KEYS);
    } finally {
      await app.close();
    }
  });

  it("shares one connection between the repositories and the transaction manager", async () => {
    const app = buildApp({ env: { VITEST: "1" } });
    try {
      // `TransactionManager` carries no transaction handle, so this identity is
      // what makes `inTransaction` correct. See
      // docs/decisions/0001-persistence-boundary.md.
      expect(app.services.transactionManager).toBe(
        app.services.runtimeRepositories.store
      );
    } finally {
      await app.close();
    }
  });

  it("keeps provider state in memory when no provider database path is set", async () => {
    const app = buildApp({ env: { VITEST: "1" } });
    try {
      expect(app.services.runtimeConfig.providerStateDbPath).toBeUndefined();
      expect(providerRepositoryNames(app)).toEqual({
        mapping: "InMemoryProviderTaskMappingRepository",
        receipt: "InMemoryProviderResponseReceiptRepository"
      });
    } finally {
      await app.close();
    }
  });

  it("puts both provider repositories on sqlite when a path is set", async () => {
    const providerStateDbPath = join(
      mkdtempSync(join(tmpdir(), "composition-")),
      "provider-state.sqlite"
    );
    const app = buildApp({
      env: { VITEST: "1", PROVIDER_SQLITE_PATH: providerStateDbPath }
    });
    try {
      // Mapping and receipt repositories must never straddle the branch: a
      // sqlite mapping with an in-memory receipt would lose dedupe state on
      // restart while appearing durable.
      expect(providerRepositoryNames(app)).toEqual({
        mapping: "SQLiteProviderTaskMappingRepository",
        receipt: "SQLiteProviderResponseReceiptRepository"
      });
    } finally {
      await app.close();
    }
  });
});
