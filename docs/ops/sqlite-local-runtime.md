# SQLite Local Runtime Operations

## Environment

- `RUNTIME_SQLITE_PATH`: SQLite database path. Defaults to `.runtime/local-runtime.sqlite` outside tests.
- `RUNTIME_ARTIFACT_ROOT`: local artifact directory. Defaults to `.runtime/artifacts`.
- `RUNTIME_QUEUE_CLAIM_TTL_SECONDS`: queue-claim recovery threshold. Defaults to `300`.
- `LOCAL_PROVIDER_MODE`: `simulated` by default.

## Start

```bash
npm run dev
```

The app validates the runtime paths before accepting requests.

## Validate

```bash
npm run lint
npm run build
npm test
npm run validate:local-runtime
```

`validate:local-runtime` runs a local create -> artifact -> privacy -> self-verification -> inspection flow against a temporary SQLite database.

## Inspect

```bash
curl http://localhost:3000/runtime/inspection
curl http://localhost:3000/runtime/inspection/jobs/<job-id>
```

## Reset

- Stop the service first.
- Remove the database and artifact directories you configured for this runtime.
- Restart the service to recreate them.

Example:

```bash
rm -rf .runtime/local-runtime.sqlite .runtime/artifacts
```
