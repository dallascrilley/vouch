# vouch

This repository is Vouch: human review as an API. Narrative authority is
[`README.md`](README.md). Machine-wide policy is not restated here.

## Launch

An agent POSTs a verification job and gets back a machine-readable consensus
verdict. Offline harnesses prove the loop; live crowd review stays an operator
walkthrough. Run them with `npm run validate:local-runtime`,
`validate:provider-e2e`, `validate:provider-proof-bundle`,
`validate:agent-loop`, and `validate:pi-extension`.
