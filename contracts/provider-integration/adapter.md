# Adapter Contract: Real Provider Integration

## Purpose

Defines the adapter-level behavior required for the first real provider integration.

## Required Guarantees

- Internal review task IDs map durably to provider-side task identifiers.
- Provider dispatch occurs only after the privacy gate and route policy approve externalization.
- Provider responses are normalized into the existing provider-neutral response model.
- Duplicate, delayed, or malformed provider responses are handled without corrupting verification state.

## Dispatch Contract

- Adapter receives a provider-neutral review task and produces a provider-side task identifier.
- Adapter records provider mapping state durably before considering dispatch successful.
- Every dispatch includes a stable `idempotency_key` (the review task's
  idempotency key, falling back to its durable review-task ID). Provider
  adapters and bridges must return the original provider task when that key is
  retried, including after a timeout or lost response.
- A transport failure, timeout, malformed success response, or provider-side
  5xx is an ambiguous outcome: retain the spend reservation and reconcile by
  idempotency key before another paid dispatch. Definitive 4xx validation
  failures produce explicit fallback or blocked outcomes.

## Ingestion Contract

- Adapter supports one real response-ingestion path.
- Raw provider delivery metadata is recorded locally before normalization.
- Normalized responses continue through the existing response, consensus, and adjudication pipeline.
