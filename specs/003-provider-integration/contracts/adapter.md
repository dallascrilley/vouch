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
- Dispatch failures produce explicit fallback or blocked outcomes.

## Ingestion Contract

- Adapter supports one real response-ingestion path.
- Raw provider delivery metadata is recorded locally before normalization.
- Normalized responses continue through the existing response, consensus, and adjudication pipeline.
