# 0002. Thin app bootstrap composition root

- **Status:** proposed
- **Date:** 2026-08-18

Answers the RFC requested in issue #2. Written against `460b66b`.
Proposed, not accepted: the choice between options B and A-only is a cost
call, and it is the repo owner's.

## Context

Issue #2 describes `src/api/app.ts` as a shallow composition root that every
new service has to touch. That is accurate, and the file has grown to **420
lines** since the issue was filed (the issue says ~340).

The constraints are fixed and this RFC honors all three: `buildApp()` stays the
primary test entry point, env overrides for provider mode / sqlite paths /
simulated providers keep working, and the Fastify plugin-and-route
registration pattern is unchanged.

## What the code actually looks like

Measured, not assumed:

| Fact                                                       | Value                               |
| ---------------------------------------------------------- | ----------------------------------- |
| Lines in `src/api/app.ts`                                  | 420                                 |
| Files that call `buildApp`                                 | 45 (56 call sites)                  |
| Files that construct a domain service directly             | **0** (only `app.ts`)               |
| Domain services and registries constructed in `app.ts`     | 18                                  |
| Adapter and infrastructure classes constructed in `app.ts` | 11 (3 defined inline, lines 80-128) |
| Members declared on `AppServices`                          | 23                                  |
| Members decorated but never read                           | 3                                   |

Two consequences follow immediately.

**There is no such thing as a partial graph today.** Not one test, script, or
worker builds a subset. The issue asks "how tests construct partial graphs";
the honest answer is that they cannot, and all 56 call sites take the
whole runtime — including `src/workers/index.ts`, which builds the full
Fastify app, the operator-token `onRequest` hook, the `/health` route, and all
eight route modules in order to read `app.services.queueStore` and two
services off it.

**`app.ts` is the only construction site in the codebase.** That is a real
strength worth preserving through any refactor: there is exactly one place to
look, and no competing wiring path has grown up beside it. The problem is the
file's internal structure, not a scattered graph.

## Findings that change the design

### 1. `AppServices` is a lower bound, not a checked shape

`app.decorate("services", { ... })` does **not** type-check the object against
`AppServices`. Fastify's `DecorationMethod` infers a generic `T` merely
_constrained_ by `FastifyInstance["services"]`:

```ts
<T extends (P extends keyof This ? This[P] : unknown), P extends string | symbol>
  (property: P, value: GetterSetter<This, ...T...>, dependencies?: string[]): Return;
```

Because the literal's type is inferred as `T` rather than checked against
`AppServices`, extra keys widen `T` and pass silently. Verified against
`460b66b`: adding `zzzBogus: 1` to the decoration compiles with zero errors.

This is not theoretical — it has already drifted. `ledgerService` was
decorated at line 348 but absent from `AppServices`, so it was reachable at
runtime and invisible to every consumer. Removing a _required_ member does
error, but the message names the excess property instead of the missing one:

```
error TS2353: ... 'ledgerService' does not exist in type 'GetterSetter<...>'
```

which points a reader at the wrong line entirely.

**Fixed in this change** (the one code edit here), because it is the evidence
for the finding and a 3-line correction:

```ts
const services: AppServices = { ... };
app.decorate("services", services);
```

The annotation restores both checks and the correct diagnostics. Re-verified:
the excess-key probe now reports `'zzzBogus' does not exist in type
'AppServices'`, and the missing-key probe now reports `Property 'metrics' is
missing`.

Any option below should keep this annotation. Without it, a "thin" bootstrap
would be free to under- or over-decorate with no compiler signal.

### 2. Configuration is split across two mechanisms, and only one is typed

`RuntimeConfig` is a typed, injectable 13-field object. Provider configuration
is **not** part of it — `loadDefaultProviderConfig(env)` is called _inside_
`buildApp` and reads 12 `PROVIDER_*` variables straight off `env`.

The practical effect is on tests. To enable providers a caller must pass a
whole `NodeJS.ProcessEnv`, and the spread is load-bearing:

```ts
buildApp({ env: { ...process.env, PROVIDER_ENABLED: "true", ... } })
```

Drop `...process.env` and `VITEST` goes missing, at which point
`loadRuntimeConfig` silently switches `databasePath` from `:memory:` to
`.runtime/local-runtime.sqlite` — which is not merely "a real file" but the
same on-disk store `npm run verify` and the offline harnesses use, so the test
suite would silently write into it and leak state between runs. All 12 test
sites got this right (10 spread it directly, 2 route through
`tests/helpers/provider-test-app.ts`, which spreads it for them), so it was a
footgun rather than a live bug.

**The footgun half is now closed.** `resolveConfig` layers the caller's env
over the ambient one (`{ ...process.env, ...options.env }`) instead of
replacing it, so the spread is no longer load-bearing. Every existing caller
already spread `process.env`, so the merge is a no-op for all of them.
Regression test: `tests/unit/build-app-env.test.ts`.

The **typed-options** half of this finding still stands: provider config is
still read off `env` inside `buildApp`, callers still pass a
`NodeJS.ProcessEnv` to enable providers, and the duplicated derivation below
is unchanged.

The same fact is also derived twice, 12 lines apart and in opposite polarity:

```ts
// line 274 — raw env read, inside the PrivacyGate constructor call
config.localProviderMode === "disabled" || env.PROVIDER_ENABLED !== "true";
// line 286 — the typed derivation, computed after
loadDefaultProviderConfig(env).enabled; // === (env.PROVIDER_ENABLED === "true")
```

These agree today. Nothing keeps them agreeing.

### 3. `resolveConfig` discriminates by structural sniff

```ts
if (input && "databasePath" in input) {
  /* it's a RuntimeConfig */
}
```

`buildApp` accepts `RuntimeConfig | BuildAppOptions` and tells them apart by
probing for one property name. Adding `databasePath` to `BuildAppOptions` — a
plausible convenience — would silently reroute every options-style call into
the config branch, discarding `env` and `fetchImpl`. A tagged option or two
named entry points removes the hazard.

### 4. Provider persistence selection is a ternary with a side effect

```ts
let providerStateStore: SQLiteProviderStateStore | undefined;
const providerMappingRepository: ProviderTaskMappingRepository =
  config.providerStateDbPath
    ? ((providerStateStore = new SQLiteProviderStateStore(
        config.providerStateDbPath
      )),
      new SQLiteProviderTaskMappingRepository(providerStateStore))
    : new InMemoryProviderTaskMappingRepository();
const providerReceiptRepository: ProviderResponseReceiptRepository =
  providerStateStore
    ? new SQLiteProviderResponseReceiptRepository(providerStateStore)
    : new InMemoryProviderResponseReceiptRepository();
```

An assignment inside a comma expression inside a ternary, whose result the
_next_ declaration then branches on. It is correct, and it is the single
hardest passage in the file to read. It is also where issue #2's third
deliverable — "where provider persistence (memory vs sqlite) is selected" —
actually lives, together with the two in-memory repository classes defined at
lines 95-128 of the composition root itself.

### 5. Three decorated members are never read; one route family reaches past the services

`providerConfigService`, `transactionManager`, and (formerly) `ledgerService`
are decorated and read by nothing in `src`, `tests`, or `scripts`.

Separately, `services.runtimeRepositories` is read 13 times across
`routes/runtime-operations.ts` (8), `routes/stuck-state.ts` (4), and
`routes/release-artifact.ts` (1). Every one of those is a read
(`findByJobId` / `listByJobId`) assembling an operator or diagnostic view.
This is a read-model path, not a layering violation, but it does mean the
whole repository bundle is part of the bootstrap's public surface and cannot
simply be hidden behind services.

## Options

### Option A — Extract into named factories, keep the surface identical

Split `app.ts` into `src/api/composition/`:

```
composition/repositories.ts   createRuntimeStores(config)      -> stores + close()
composition/provider-state.ts createProviderStores(config)     -> mappings, receipts, close()
composition/services.ts       createDomainServices(deps)       -> AppServices minus infra
composition/routes.ts         registerRoutes(app)              -> unchanged list
```

`buildApp` keeps its exact signature and shrinks to roughly 40 lines of
orchestration. The three inline in-memory repository classes move out of the
composition root. Nothing outside `app.ts` changes; all 56 call sites and both
entry points are untouched.

- **Buys:** readability, one obvious home per new service, the ternary from
  finding 4 becomes a named function with one branch.
- **Costs:** roughly zero risk, roughly one hour.
- **Does not buy:** partial graphs. Callers still get the whole app.

### Option B — `createRuntime(config) -> Runtime`, with `buildApp` as a thin adapter

The shape issue #2 suggests. Option A's extraction is a strict prerequisite,
so B is A plus one more step:

```ts
export type Runtime = { services: AppServices; close(): Promise<void> };
export function createRuntime(options: RuntimeOptions): Runtime;
export function registerRoutes(app: FastifyInstance): void;

export function buildApp(
  input?: RuntimeConfig | BuildAppOptions
): FastifyInstance {
  const runtime = createRuntime(resolveConfig(input));
  const app = Fastify({
    logger: { level: runtime.services.runtimeConfig.logLevel }
  });
  app.decorate("services", runtime.services);
  app.addHook("onClose", () => runtime.close());
  registerRoutes(app);
  return app;
}
```

- **Buys:** a service graph constructible without Fastify. `src/workers/index.ts`
  stops paying for eight route modules and an auth hook to reach `queueStore`.
  Unit tests can hold real services and drive them directly instead of going
  through `app.inject`, which is currently the only way to touch a service.
- **Costs:** a second public surface to keep honest, and one genuine design
  question — today teardown is a Fastify `onClose` hook closing two SQLite
  stores; `Runtime.close()` has to own that, and `buildApp` must not double-close.
- **Risk:** low but not zero, because it moves lifecycle ownership.

`RuntimeOptions` should also absorb finding 2: accept an optional typed
`providerConfig` so callers stop passing `NodeJS.ProcessEnv`, with
`loadDefaultProviderConfig(env)` as the default. That removes the load-bearing
spread and the duplicated derivation in one move, and it is worth doing
**independently of whether B is adopted**.

### Option C — One Fastify plugin per bounded context

Each domain area registers as a plugin that decorates its own services;
`buildApp` becomes a list of `app.register(...)` calls.

**Recommend against.** The graph is too cross-linked for plugin encapsulation
to help: `jobService` and `ledgerService` are constructor arguments to ten and
nine other services respectively, and `transactionManager` to ten. Plugin registration order would become the new implicit coupling,
enforced at runtime instead of by the compiler, and Fastify's encapsulation
would actively fight a graph that is deliberately shared. It also conflicts
with keeping `AppServices` a single checked type (finding 1).

## Recommendation

**Do A now; adopt B only if a concrete need for a Fastify-free graph appears.**

A is nearly free, carries no behavioral risk, and delivers the thing issue #2
actually complains about — "every new service touches this file" becomes
"every new service touches `composition/services.ts`". B's extra value is
real but currently hypothetical: zero tests want a partial graph today, and
the one caller that would clearly benefit is `src/workers/index.ts`.

Two changes are worth making regardless of A/B/C, because each closes a
specific hazard identified above:

1. Keep the `const services: AppServices` annotation (finding 1). **Already done.**
2. Move provider config into typed options (finding 2), which retires the
   duplicated `PROVIDER_ENABLED` derivation and stops callers from having to
   hand `buildApp` a `NodeJS.ProcessEnv` at all. The load-bearing spread half
   of that finding is **already done**.

And one smaller cleanup: replace the structural sniff in `resolveConfig`
(finding 3) with a tagged discriminator.

## What this RFC does not decide

- Whether `providerConfigService` and `transactionManager` should be dropped
  from `AppServices` or wired up to a consumer. They are decorated and unread;
  either answer is defensible and neither is urgent.
- Whether the read-model reach-through in finding 5 should get its own port.
  It is coherent as-is.
- Anything about the persistence boundary — see
  [0001](0001-persistence-boundary.md). The two RFCs meet at exactly one point:
  whatever `createRuntime` looks like, it is where a Postgres adapter set would
  be selected.
