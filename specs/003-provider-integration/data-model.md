# Data Model: Provider Integration

## ProviderAdapterConfig

Represents the local configuration required to enable the real provider adapter.

**Fields**

- `provider_id`
- `credential_source`
- `account_scope`
- `dispatch_mode`
- `ingestion_mode`
- `callback_base_url`
- `enabled`

## ProviderTaskMapping

Persistent mapping between internal review tasks and provider-side task identifiers.

**Fields**

- `review_task_id`
- `provider_id`
- `provider_task_id`
- `provider_assignment_scope`
- `dispatch_status`
- `created_at`
- `updated_at`

## ProviderResponseReceipt

Persistent record of provider-delivered response metadata before normalization.

**Fields**

- `receipt_id`
- `provider_id`
- `provider_task_id`
- `provider_response_id`
- `delivery_mode`
- `received_at`
- `normalized_response_id`
- `dedupe_key`

## ProviderHealthState

Local runtime view of provider availability and degradation.

**Fields**

- `provider_id`
- `status`
- `last_success_at`
- `last_failure_at`
- `failure_reason`
- `fallback_route`

## LocalProviderValidationProfile

Represents the local validation inputs and expected checks for the provider adapter.

**Fields**

- `provider_id`
- `validation_command_set`
- `required_local_env`
- `expected_dispatch_evidence`
- `expected_ingestion_evidence`
