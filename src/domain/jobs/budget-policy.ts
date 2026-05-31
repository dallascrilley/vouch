import type { RiskTier } from "../shared/types.js";

export type BudgetPolicy = {
  maxJobCost: number;
  maxAssignments: number;
  maxRetries: number;
  maxRunCost?: number;
  maxProjectDailyCost?: number;
  maxProviderDailyCost?: number;
  riskTierOverrides?: Partial<Record<RiskTier, Partial<BudgetPolicy>>>;
};

export type BudgetUsage = {
  assignmentCount: number;
  jobCost: number;
  retriesUsed: number;
  runCost?: number;
  projectDailyCost?: number;
  providerDailyCost?: number;
};

export type BudgetEvaluation = {
  allowed: boolean;
  blockingCaps: string[];
};

function mergePolicy(base: BudgetPolicy, override?: Partial<BudgetPolicy>): BudgetPolicy {
  if (!override) {
    return base;
  }

  return {
    ...base,
    ...override,
    riskTierOverrides: base.riskTierOverrides
  };
}

export function resolveBudgetPolicy(policy: BudgetPolicy, riskTier: RiskTier): BudgetPolicy {
  return mergePolicy(policy, policy.riskTierOverrides?.[riskTier]);
}

export function evaluateBudgetPolicy(
  policy: BudgetPolicy,
  usage: BudgetUsage,
  riskTier: RiskTier
): BudgetEvaluation {
  const resolvedPolicy = resolveBudgetPolicy(policy, riskTier);
  const blockingCaps: string[] = [];

  if (usage.jobCost > resolvedPolicy.maxJobCost) {
    blockingCaps.push("maxJobCost");
  }

  if (usage.assignmentCount > resolvedPolicy.maxAssignments) {
    blockingCaps.push("maxAssignments");
  }

  if (usage.retriesUsed > resolvedPolicy.maxRetries) {
    blockingCaps.push("maxRetries");
  }

  if (
    resolvedPolicy.maxRunCost !== undefined &&
    usage.runCost !== undefined &&
    usage.runCost > resolvedPolicy.maxRunCost
  ) {
    blockingCaps.push("maxRunCost");
  }

  if (
    resolvedPolicy.maxProjectDailyCost !== undefined &&
    usage.projectDailyCost !== undefined &&
    usage.projectDailyCost > resolvedPolicy.maxProjectDailyCost
  ) {
    blockingCaps.push("maxProjectDailyCost");
  }

  if (
    resolvedPolicy.maxProviderDailyCost !== undefined &&
    usage.providerDailyCost !== undefined &&
    usage.providerDailyCost > resolvedPolicy.maxProviderDailyCost
  ) {
    blockingCaps.push("maxProviderDailyCost");
  }

  return {
    allowed: blockingCaps.length === 0,
    blockingCaps
  };
}
