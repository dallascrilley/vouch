Research pass: current marketplace constraints to design around

MTurk is still best modeled as a programmable crowd marketplace, not a verification architecture. A requester creates HITs with attributes such as reward, assignment duration, lifetime, max assignments, qualification requirements, review policies, requester annotations, and idempotency tokens. MTurk also supports an ExternalQuestion, which lets you host your own HTTPS task UI while MTurk handles worker assignment and submission plumbing. That is useful here because the task UI, schema, redaction, and adjudication logic should remain yours rather than being defined by MTurk. ￼ ￼

MTurk’s economics should be treated as one provider-specific cost model: the requester chooses the worker reward, MTurk charges a 20% fee on rewards and bonuses, tasks with 10 or more assignments incur an additional 20% fee, Masters adds 5%, and Premium Qualifications can add per-assignment fees. It also supports worker qualifications, including requester-created qualifications and system qualifications such as number of approved HITs and approval percentage. ￼ ￼

Prolific is a useful comparable provider, but it has a different abstraction: API-driven study creation, participant recruitment, submission collection, pre-screeners, participant groups, manual or bulk approval, and participant-quality controls. Prolific also publishes pay guidance, with a recommended minimum of £9 / $12 per hour and an absolute minimum of £6 / $8 per hour, and its high-load guidance emphasizes bulk payment operations, webhooks over polling, and workspace-level bottlenecks rather than fixed public rate limits. ￼ ￼ ￼ ￼

Comparable vendors such as Scale, Labelbox, Toloka, and Appen position themselves more as managed data/evaluation platforms with human feedback, expert review, annotation, model evaluation, or AI data services. That reinforces the design requirement: use a provider abstraction based on capabilities, not a hardcoded “MTurk job” model. ￼ ￼ ￼ ￼

⸻

Executive recommendation

Use a central Verification Control Plane with three explicitly separate layers:

1. Self-verification layer
 Deterministic checks, screenshot diffing, OCR/layout checks, accessibility checks, trace/log analysis, and model-based review produce a structured self-verification verdict and confidence score.
2. Human-verification layer
 A provider-agnostic External Task Broker creates sanitized, observable verification tasks for MTurk, Prolific, managed vendors, or an internal reviewer pool. Providers collect human observations only.
3. Adjudication layer
 A separate Consensus and Adjudication service normalizes human responses, weighs worker quality, resolves disagreements, produces the final verdict, and emits machine-readable feedback to the agent.

This architecture is practical because it gives you a fast self-check path, preserves provider optionality, keeps privacy policy centralized, and makes human review an escalation mechanism rather than a replacement for automated QA.

⸻

1. Architecture options

Option A — Central Verification Control Plane with provider adapters

Shape

Agent / CI
 -> Verification API
 -> Artifact Vault + Privacy Gate
 -> Self Verification Engine
 -> Escalation Decision Engine
 -> External Task Broker
 -> Provider Adapters: MTurk, Prolific, Managed Vendor, Internal Panel
 -> Consensus + Adjudication
 -> Final Verdict + Feedback Signal
 -> Agent retry / release gate

Best for

A first production system that needs strong privacy controls, clear service boundaries, and provider-agnostic human review.

Strengths

* Clean separation between self-checks, human checks, and adjudication.
* Provider adapters are replaceable.
* A hosted task UI gives you one consistent worker experience across MTurk, Prolific, and managed vendors.
* Privacy gate sits before externalization, not inside each provider integration.
* Easier MVP because the orchestrator can be a state machine with queues rather than a large distributed platform.

Weaknesses

* The central control plane can become a throughput bottleneck if not designed with queueing and idempotent job processing.
* You must build and maintain your own task UI, response schema, evidence packaging, and consensus logic.
* You need enough internal discipline to prevent provider-specific leakage into core job models.

Verdict

Recommended. Build this first.

⸻

Option B — Event-sourced verification pipeline

Shape

Every artifact, self-check, human assignment, provider event, adjudication decision, retry, and release decision is an immutable event.

Evidence Events
 -> Check Workers
 -> Policy Workers
 -> Provider Dispatch Workers
 -> Human Response Events
 -> Consensus Workers
 -> Verdict Events
 -> Feedback Events

Best for

High-volume autonomous QA where you expect many teams, many providers, reprocessing of old evidence, multiple self-verification models, and long-term analytics.

Strengths

* Excellent auditability.
* Easy to replay old jobs when you change self-verification models or thresholds.
* Good for drift detection and calibration.
* Scales naturally by adding consumers.

Weaknesses

* Higher operational complexity.
* Harder to reason about early.
* Release-gating paths need careful handling because eventual consistency can create ambiguous “pending” states.
* Overkill for an MVP unless you already run event-sourced infrastructure.

Verdict

Good target architecture later. Do not start here unless volume and compliance demands justify it.

⸻

Option C — Managed human-evaluation platform first

Shape

Self-verification runs internally, then uncertain jobs are pushed to a managed vendor or labeling/evaluation platform. Your system keeps the final adjudication and feedback loop, but more task routing and reviewer management happen inside the vendor.

Best for

High-risk enterprise QA where you need vetted reviewers, NDA-backed workflows, domain specialists, stronger operational support, or privacy/security terms that public marketplaces cannot provide.

Strengths

* Less worker-quality overhead.
* Better fit for expert or NDA workflows.
* Can be faster to operationalize for sensitive review if vendor contracts and data processing terms are acceptable.
* Stronger quality support than a raw public marketplace.

Weaknesses

* Higher cost.
* More vendor lock-in.
* Less control over UI, response schema, and turnaround.
* Harder to use as a fully autonomous continuous loop unless the vendor has strong APIs and webhooks.
* Not ideal if you need very small, cheap, frequent micro-verifications.

Verdict

Use as a second or third provider type. Do not let it define the architecture.

⸻

2. Recommended architecture

Use Option A with an evented ledger internally.

The core system should look like this:

 ┌──────────────────────────┐ Agent / CI / Release Gate └─────────────┬────────────┘ v
┌──────────────────────────────────────────────────────────┐ Verification Control Plane 1. Job Intake API 2. Artifact Vault + Manifest Store 3. Criteria Compiler 4. Privacy / DLP / Redaction Gate 5. Self Verification Engine 6. Confidence + Escalation Policy Engine 7. External Task Broker 8. Provider Adapter Registry 9. Human Task UI Service 10. Result Ingestion 11. Consensus Engine 12. Adjudication Service 13. Verdict Ledger 14. Feedback Signal Bus 15. Budget, Rate, and Safety Controller 16. Observability └──────────────────────────────────────────────────────────┘ ┌───────────────────┼───────────────────┐
 v v v
 MTurk Adapter Prolific Adapter Managed Vendor Adapter v v v
 Public workers Verified participants NDA / expert reviewers

The critical design principle: the provider only supplies human observations. It does not own your verification semantics, privacy policy, final verdict, retry policy, or release decision.

⸻

3. System boundaries and major components

Inside the verification platform

Component	Responsibility
Verification Job Intake API	Accepts a verification request from the agent, CI, or release gate. Creates a stable job ID and idempotency key.
Artifact Collector / Manifest Store	Records screenshots, DOM snapshots, accessibility trees, logs, traces, videos, task metadata, and acceptance criteria. Stores hashes, provenance, timestamps, environment, browser, viewport, and version info.
Artifact Vault	Stores raw artifacts internally with strict access control. Produces derived sanitized packages for human review.
Criteria Compiler	Converts human-readable acceptance criteria into checkable criteria: deterministic checks, visual checks, model-review rubric, and human-review rubric.
Privacy Gate / Redaction Service	Classifies artifacts, strips secrets, redacts screenshots, filters logs, blocks unsafe externalization, and records audit decisions.
Self Verification Engine	Runs screenshot diffing, DOM checks, OCR/layout checks, accessibility checks, trace checks, console/network checks, and model-based review.
Confidence Scoring Engine	Combines check results, model confidence, risk class, artifact quality, novelty, and historical calibration into a self-verification confidence score.
Escalation Policy Engine	Decides whether to pass, fail, retry autonomously, ask humans, route to internal review, or fail closed.
External Task Broker	Creates provider-neutral human-verification tasks, chooses providers, enforces cost/latency/privacy policies, tracks external job state, and handles retries.
Provider Adapters	Translate provider-neutral tasks into MTurk HITs, Prolific studies/submissions, managed-vendor jobs, or internal reviewer tasks.
Task UI Service	Hosts the actual reviewer UI and structured response form. This avoids provider UI lock-in.
Result Ingestion Service	Receives webhooks, polls where necessary, verifies provider callbacks, normalizes submissions, and records raw provider responses.
Consensus Engine	Aggregates worker responses using quorum, worker reliability, gold-task performance, attention checks, and disagreement rules.
Adjudication Service	Resolves unresolved or high-risk disagreements. Can route to senior internal reviewers or a managed expert pool.
Verdict Ledger	Immutable record of every job state transition, artifact hash, policy decision, self-check result, human answer, adjudication decision, and final verdict.
Feedback Signal Bus	Emits machine-readable verdicts and failure signals back to the agent, CI, issue tracker, dashboards, and training/evaluation stores.
Budget and Safety Controller	Enforces per-job, per-agent, per-project, daily, provider, and release budget caps. Also controls retry limits and externalization limits.
Observability Layer	Metrics, dashboards, audit logs, false-positive/false-negative tracking, drift detection, provider health, and cost reporting.

Outside the verification platform

External system	Boundary rule
AI agent	Produces task output and evidence. Receives verdicts and structured retry signals. Does not decide when private artifacts may be externalized.
Application under test	Produces UI state, DOM, logs, traces, screenshots, and accessibility tree. Should usually run in synthetic/staging environments for external review.
MTurk / Prolific / vendors	Receive only sanitized human-review packages. They never receive raw internal artifacts by default.
Release system	Consumes final verdicts. It should not infer pass/fail from raw worker responses.
Issue tracker	Receives normalized defects, severity, screenshots, annotations, and reproduction metadata.
Model-training / eval store	Receives approved labels and calibration data according to privacy policy.

⸻

4. Artifact model

The artifact model should separate raw evidence, sanitized review evidence, and machine-readable verification state.

Core object: VerificationJob

Fields conceptually include:

Field group	Examples
Identity	job ID, agent run ID, parent retry ID, idempotency key, trace ID
Source	repository, branch, commit, build ID, environment, feature flag set
Task metadata	task name, user story, route/page, browser, viewport, locale, timezone, device class
Risk metadata	risk tier, release-gating flag, customer-data flag, regulatory flag, externalization policy
Acceptance criteria	criterion ID, text, criticality, observable evidence, pass threshold, human-visible wording
Budget/deadline	max cost, max external assignments, max retries, deadline, provider preferences
State	created, self-verifying, retryable-failed, external-queued, human-reviewing, adjudicating, passed, failed, fail-closed, canceled

Artifact types

Artifact	Purpose	Externalization default
Final screenshot	Primary visual evidence for human review and visual model review.	Allowed only after redaction and risk approval.
Before/after screenshots	Useful for visual regression and change verification.	Redacted crops preferred.
Baseline screenshot	Expected reference for visual diff.	Often internal only unless sanitized and necessary.
DOM snapshot	Enables selector checks, text checks, layout mapping, and screenshot-to-element mapping.	Usually not sent externally except sanitized snippets.
Accessibility tree	Supports role/name checks, keyboard checks, screen-reader structure, ARIA verification.	Usually safe after stripping labels that contain sensitive data.
Console logs	Detect runtime errors and warnings.	Never raw externally; summary only.
Network trace	Detect failed requests, status codes, latency, unexpected endpoints.	Never raw externally; summary only.
Browser trace / video	Reconstructs steps when screenshot is ambiguous.	Send only sanitized clips/crops if policy allows.
OCR output	Text extracted from screenshot, with coordinates.	Can be sent as reviewer aid only if redacted.
Layout map	Bounding boxes, overlaps, clipped regions, viewport geometry.	Usually internal; selected annotations may be external.
Agent task evidence	What the agent claims it completed.	Human-visible only as observable task summary, never hidden reasoning.
Acceptance criteria	Defines pass/fail.	Human-visible version must be concise and observable.

Raw artifact vs. human work package

Create two separate packages:

Raw internal package

Contains complete screenshots, full DOM snapshot, raw traces, console logs, network metadata, model review output, self-verification details, and internal provenance.

Only internal services and authorized engineers can access this.

Sanitized external package

Contains the minimum needed for a human to answer observable questions:

* Redacted screenshot or cropped region.
* Plain-language task summary.
* Observable acceptance criteria.
* Optional sanitized before/after view.
* Optional sanitized OCR text.
* Optional sanitized trace summary, such as “Save request returned success” rather than raw endpoint/payload.
* No cookies, tokens, internal URLs, raw logs, customer identifiers, credentials, hidden prompts, chain-of-thought, or internal agent reasoning.

Each external package should include a transform lineage record:

raw_artifact_hash
redaction_policy_version
redaction_transform_hash
dlp_scan_result
externalization_decision
human_package_hash

⸻

5. Self-verification layer

Self-verification should be a real layer, not a superficial pre-filter.

Deterministic checks

Use these whenever the acceptance criteria are machine-checkable.

Check type	Examples
DOM/state checks	Element exists, role/name matches, button enabled, route correct, modal open, value persisted, expected table row present.
Trace checks	No failed critical requests, no uncaught exceptions, expected API call completed, no client-side crash.
Console checks	No fatal errors, no hydration errors, no known high-severity warnings.
Data checks	Expected record ID, status, price, count, label, or timestamp appears in UI state.
Environment checks	Correct tenant, synthetic account, staging domain, no production customer data.

Deterministic failures should be treated as high-confidence when the criteria are precise. For example, “Save button is enabled” should not need human review if the DOM and accessibility tree both show the expected button state.

Screenshot diffing

Use visual baselines and component-level crops.

Recommended outputs:

* Pixel difference.
* Perceptual hash distance.
* Structural similarity score.
* Changed regions.
* Ignored dynamic regions.
* Component-level crop diffs.
* Artifact-quality checks: blank page, loading spinner, partial render, missing font, clipped screenshot.

Avoid a single global threshold. A one-pixel global diff can be harmless, while a small difference around a CTA label can be severe.

OCR and layout checks

Use OCR and layout geometry to detect:

* Expected text missing.
* Text present but clipped.
* Text overlapping another element.
* Incorrect visual ordering.
* Broken wrapping.
* Unexpected truncation.
* Misplaced primary CTA.
* Placeholder text still visible.
* Error toast obscuring the UI.
* Empty states or loading states that should not remain.

OCR should not be trusted alone. It is best used as corroborating evidence for screenshot and DOM checks.

Accessibility checks

Run accessibility checks as first-class verification, not as separate linting.

Check:

* Accessible name and role.
* Keyboard focusability.
* Tab order.
* Focus trap in modals.
* Color contrast.
* Form labels and error messages.
* ARIA validity.
* Landmarks.
* Screen-reader text.
* Hidden/visible state consistency.
* Reduced motion or responsive behavior where applicable.

Accessibility failures can either be release-gating or warning-level depending on severity and product policy.

Model-based visual review

Use a multimodal model reviewer when deterministic checks are insufficient.

The model should receive:

* Sanitized screenshot or internal raw screenshot depending on policy.
* Task summary.
* Acceptance criteria.
* Known relevant context.
* Required output schema.

The model should return:

* Pass/fail/uncertain.
* Per-criterion status.
* Confidence.
* Visual evidence summary.
* Suspected issue category.
* Regions of concern if supported.
* Whether the artifact is insufficient.

Do not ask the model to expose hidden chain-of-thought. Ask for concise evidence, not private reasoning.

Confidence scoring

The confidence score should combine:

Signal	Effect
Critical deterministic pass	Raises confidence.
Critical deterministic failure	Usually fails or triggers agent retry.
Screenshot diff localized to important UI	Lowers pass confidence.
OCR/layout mismatch	Lowers confidence or creates failure.
Accessibility critical violation	Can fail directly.
Model agrees with deterministic checks	Raises confidence.
Model disagrees with deterministic checks	Escalates.
Artifact quality poor	Recapture or escalate as artifact issue.
New component/page/baseline	Lowers confidence.
High-risk release gate	Raises threshold for autonomous pass.
Similar historical cases with human agreement	Calibrates confidence up or down.

Suggested verdict bands:

Condition	Action
High-confidence pass, low/medium risk	Final pass.
High-confidence fail, actionable	Return retry signal to agent.
High-confidence fail, not actionable	Final fail or issue creation.
Medium confidence	Escalate to human if privacy allows.
Low confidence due to artifact quality	Recapture evidence.
Privacy unsafe and self-verification insufficient	Fail closed or route to internal vetted review.

⸻

6. Escalation policy

The escalation policy decides between five outcomes:

1. Pass autonomously
2. Retry autonomously
3. Ask external humans
4. Ask internal/vetted humans
5. Fail closed

External human review should trigger when

* Self-verification confidence is below the pass threshold but not a clear fail.
* Deterministic and model-based review disagree.
* Screenshot diff is visually significant but semantically ambiguous.
* OCR/layout checks detect possible clipping, overlap, or text mismatch that needs human judgment.
* The task is release-gating and policy requires independent human sampling.
* The page/component is new or historically flaky.
* The agent has retried and still produces uncertain evidence.
* A periodic audit sample is selected to estimate false negatives.
* The acceptance criteria are inherently visual or user-perception-based, such as “the success state is clearly visible.”

The agent should retry itself when

* The failure is deterministic and actionable.
* The artifact capture failed: blank screenshot, spinner still loading, missing viewport, wrong route.
* The model or self-check identifies an obvious repair class.
* The task is not high-risk and retry budget remains.
* The issue is likely environmental or flaky and a recapture is permitted.

Examples:

* Missing selector.
* Button disabled.
* Route incorrect.
* Form value not persisted.
* Console error caused render failure.
* Screenshot captured too early.
* Modal closed before capture.

The system should fail closed when

* Redaction fails.
* Secret, token, credential, customer PII, regulated data, or internal-only information is detected in artifacts and no approved internal reviewer path exists.
* The artifact comes from a disallowed domain or production environment.
* Budget is exhausted.
* Deadline is exceeded and release policy requires verification.
* A critical deterministic check fails.
* Human reviewers disagree after max quorum and adjudication is unavailable.
* Provider integrity is degraded.
* Required evidence is missing and cannot be recaptured.

Escalation matrix

Situation	Action
All critical self-checks pass, high confidence, low risk	Pass.
Critical deterministic check fails	Retry if actionable; otherwise fail.
Visual diff ambiguous, privacy safe	External human review.
Model says pass, deterministic says fail	Prefer deterministic result or escalate depending on criterion.
Model says fail, deterministic says pass	Human review if visual/semantic; otherwise inspect model uncertainty.
Sensitive data detected	Block externalization. Internal review or fail closed.
Release-gating change	Require higher self threshold, human sample, or mandatory human review.
Budget cap hit	Stop external dispatch; fail closed or mark unverified according to policy.
Provider timeout	Retry provider, fallback provider, or internal review.
Human consensus fails	Add assignments up to cap, then adjudicate.

⸻

7. External Task Broker and provider abstraction

The External Task Broker should not know MTurk-specific details. It should work with provider-neutral concepts.

Provider-neutral concepts

Object	Meaning
ReviewBatch	A group of related verification tasks submitted together.
ReviewTask	One observable verification question about one artifact package.
Assignment	One human’s response to one review task.
ReviewerPool	Eligibility policy: public crowd, qualified crowd, internal, NDA vendor, domain expert.
TaskTemplate	UI/rubric shape: binary visual QA, multi-criterion QA, annotation task, severity triage.
QualityPolicy	Gold rate, attention checks, quorum, worker qualifications, response-time rules.
PaymentPolicy	Reward, bonus, pay floor, approval rules, provider fee model.
PrivacyPolicy	What artifact classes may be sent to which provider/pool.
ProviderCapabilities	What a provider can do: external URL, native forms, qualifications, webhooks, bulk approval, worker groups, expert pools, annotations, API limits, regional controls.
ProviderEvent	Created, accepted, submitted, approved, rejected, expired, canceled, errored.

Adapter responsibilities

Each provider adapter should implement these responsibilities conceptually:

Responsibility	Description
Capability declaration	States what the provider supports.
Cost estimation	Estimates reward, fees, quorum cost, platform fees, and expected total cost.
Task creation	Converts provider-neutral tasks into provider-specific jobs.
Assignment tracking	Maps provider IDs back to internal job IDs.
Result ingestion	Retrieves or receives worker responses.
Cancellation / expiration	Stops stale or no-longer-needed work.
Worker approval/payment	Approves valid submissions and handles rejections only for spam/non-effort.
Qualification updates	Updates worker qualifications or blocklists where supported.
Webhook verification	Validates provider callbacks where available.
Error normalization	Converts provider-specific API errors into internal retry/failure categories.

MTurk adapter mapping

Internal concept	MTurk mapping
ReviewTask	HIT
Assignment count / quorum	MaxAssignments
Hosted task UI	ExternalQuestion
Worker eligibility	QualificationRequirements
Batch metadata	RequesterAnnotation
Assignment duration	AssignmentDurationInSeconds
Availability window	LifetimeInSeconds
Auto-approval policy	AutoApprovalDelayInSeconds
Worker payment	Approve assignment
Spam/non-effort	Reject assignment with feedback

MTurk should be used first for low-risk, redacted, objective visual-verification tasks. It should not be the default destination for sensitive internal screenshots.

Prolific adapter mapping

Internal concept	Prolific mapping
ReviewBatch	Study or API-created collection
Reviewer eligibility	Pre-screeners, participant groups, custom groups
Hosted task UI	External survey/task URL
Submission	Participant submission
Payment	Approval, bulk approval, bonuses
Worker exclusion	Participant group blocklist or study eligibility rules
Load control	Bulk endpoints, webhooks, workspace distribution

Prolific is likely better for higher-quality participant pools, perception tasks, or structured studies, but less ideal for very tiny high-frequency microtasks unless operationally tuned.

Managed vendor adapter mapping

Internal concept	Managed provider mapping
ReviewBatch	Vendor project, dataset, job, or workstream
ReviewerPool	NDA reviewers, specialists, domain experts
TaskTemplate	Vendor labeling/evaluation interface or your embedded UI
Assignment	Label, review, annotation, or judgment
Adjudication	Vendor senior review, your internal adjudication, or both
SLA	Contractual turnaround and quality target

Managed vendors should be used for high-risk, sensitive, specialized, or release-critical review where public marketplaces are inappropriate.

⸻

8. Task UI shape

The worker should verify observable outcomes only.

They should not see:

* Hidden chain-of-thought.
* Internal agent prompts.
* Raw logs.
* Raw DOM.
* Raw network payloads.
* Credentials.
* Customer data.
* Internal reasoning.
* “The model thinks…” statements that bias judgment.

Recommended task layout

Title:
 Verify whether this UI outcome matches the stated criteria.
Left panel:
 - Screenshot, zoomable.
 - Optional before/after toggle.
 - Optional highlighted target region.
 - Optional sanitized trace summary.
 - Optional baseline image if safe.
Right panel:
 - Task summary.
 - Acceptance criteria.
 - Per-criterion answer controls.
 - Defect category.
 - Severity.
 - Confidence.
 - Annotation tool.
 - Short evidence note.

Structured worker answer

Each worker response should include:

Field	Values
Overall verdict	Pass, Fail, Unclear, Artifact insufficient
Per-criterion result	Pass, Fail, Unclear, Not visible
Severity	S0 blocker, S1 critical, S2 major, S3 minor, S4 cosmetic
Defect category	Missing element, wrong text, layout issue, visual regression, wrong state, accessibility issue, data mismatch, loading issue, artifact issue, other
Annotation	Bounding box, point, region, optional element label
Evidence note	Short factual note, not essay
Confidence	Low, medium, high
Artifact issue flag	Blank, blurry, cropped, loading, redacted too heavily, cannot determine
Time on task	Captured automatically
Gold/attention response	Hidden or embedded depending on task type

Good worker instruction style

Use specific, observable questions:

* “Is the green success toast visible?”
* “Is the ‘Save changes’ button enabled?”
* “Does the page show the user’s updated shipping address?”
* “Is any important text clipped or overlapping?”
* “Does the screenshot still show a loading spinner?”

Avoid subjective or under-specified questions:

* “Does this look good?”
* “Did the agent succeed?”
* “Is the implementation correct?”
* “Does the reasoning make sense?”

⸻

9. Quality controls

Quality controls should exist at four levels: worker eligibility, task design, response validation, and adjudication.

Worker eligibility

Use provider-specific controls through the provider abstraction:

* Minimum historical approval rate or equivalent.
* Minimum number of completed tasks.
* Custom qualification for UI QA.
* Gold-task score.
* Language/locale qualification where relevant.
* Device/browser qualification if workers must inspect responsive layouts.
* Exclusion of workers who fail repeated gold tasks.
* Separate pool for release-gating tasks.
* NDA or managed reviewer pool for sensitive tasks.

Gold tasks

Gold tasks are known-answer verification tasks inserted into the flow.

Use them to measure:

* Worker attentiveness.
* Visual QA competence.
* Severity calibration.
* Tendency to over-fail or over-pass.
* Ability to use annotation tools.

Gold tasks should be fair, not trick questions. Use examples from adjudicated historical jobs.

Suggested policy:

Job type	Gold rate
New worker qualification	20–40% during qualification phase
Routine low-risk visual QA	5–10%
Release-gating	10–20%
High-disagreement task families	Increase dynamically

Attention checks

Use light attention checks that confirm the worker can follow instructions. Do not rely on them as the main quality mechanism.

Examples:

* “Select ‘Artifact is clear’ if the screenshot is not blank.”
* “Mark the visible title text from the screenshot.”
* “Draw a box around the highlighted area.”

Avoid arbitrary traps that do not measure the verification skill.

Response validation

Discard or downweight responses when:

* Gold task failed.
* Required fields missing.
* Answer contradicts itself.
* Worker marks “pass” but reports S0/S1 severity.
* Worker marks “fail” with no failed criterion and no annotation.
* Response is completed impossibly fast.
* Screenshot was never loaded.
* Same worker attempts duplicate tasks where uniqueness is required.
* Worker free-text is irrelevant or templated.
* Worker flags artifact insufficient and other signals confirm the artifact is bad.

Quorum

Use adaptive quorum.

Case	Suggested quorum
Low-risk, objective task	2 workers if both agree, otherwise 3
Normal uncertain task	3 workers
Release-gating task	3–5 workers plus stricter thresholds
High-risk or high-disagreement task	5 workers or senior adjudicator
Sensitive/internal task	Internal or NDA reviewer quorum

Consensus model

Use reliability-weighted consensus rather than raw majority only.

Maintain a reviewer reliability score based on:

* Gold-task accuracy.
* Historical agreement with adjudicated outcomes.
* Severity calibration.
* Response completeness.
* Artifact-insufficient detection accuracy.
* Provider-level trust score.

For each criterion:

criterion_pass_probability
criterion_fail_probability
criterion_unclear_probability

Then apply policy thresholds:

Result	Rule
Pass	All critical criteria exceed pass threshold and no high-severity fail probability.
Fail	Any critical criterion exceeds fail threshold.
Unclear	Artifact insufficient or pass/fail probabilities remain close after quorum.
Adjudicate	High disagreement, release-gating case, or severe defect reported by a minority high-reliability worker.

Severity should be conservative. A credible S0/S1 report should not be averaged away by low-detail pass votes.

Disagreement handling

When workers disagree:

1. Check whether the artifact is ambiguous.
2. Check whether the task wording is ambiguous.
3. Add more assignments if within budget.
4. Route to senior adjudication if release-gating or high-risk.
5. Create a “rubric improvement” item if ambiguity came from criteria wording.
6. Feed disagreement examples into self-verifier calibration.

Important: do not reject worker submissions merely because they disagreed with the final verdict. Reject only spam, non-effort, or policy-violating submissions.

⸻

10. Privacy and compliance model

Assume any external worker can retain what they see. Redaction helps, but it is not a full confidentiality boundary.

Data classification

Class	Examples	Externalization rule
P0 Public	Public marketing page, public docs, open-source demo UI	May be sent externally if no secrets.
P1 Internal low sensitivity	Staging UI with synthetic data, internal feature names, fake users	May be sent externally after redaction and domain approval.
P2 Sensitive internal	Real employee names, internal metrics, unreleased strategy, private roadmap	Public marketplace blocked. Use internal or NDA-managed reviewers only.
P3 Regulated / customer / secret	PII, PHI, payment data, credentials, tokens, production customer content, private keys	Externalization blocked. Internal secure review only or fail closed.

Redaction pipeline

Run redaction before human review and before model review if using external model providers.

Controls:

* OCR-based text redaction.
* DOM-based sensitive field redaction.
* Regex and entropy scanning for keys, tokens, emails, phone numbers, addresses, session IDs, JWTs, API keys.
* Screenshot masking for user names, IDs, account numbers, avatars, QR codes, barcodes, maps, and free-text fields.
* Log stripping for headers, cookies, authorization, request bodies, stack traces with paths, and internal service names.
* URL normalization: domain allowlist, path hashing, query stripping.
* Network trace summarization: status and high-level outcome only.
* Canary secret detection.
* Redaction confidence score.
* Human-package preview hash.
* Deny-by-default if redaction confidence is low.

Environment restrictions

External review should initially be restricted to:

* Staging or preview environments.
* Synthetic tenants.
* Synthetic users.
* Seeded test data.
* Approved public or staging domains.
* No production screenshots.
* No customer-uploaded content.
* No live admin panels.
* No private analytics or revenue dashboards unless specifically approved and sanitized.

Domain and route allowlists

Externalization should require:

* Approved domain.
* Approved route pattern.
* Approved data source.
* Approved provider class.
* Approved reviewer pool.
* Approved artifact types.

Example:

Route	External marketplace	Managed NDA vendor	Internal review
/demo/*	Allowed	Allowed	Allowed
/staging/synthetic/*	Allowed after redaction	Allowed	Allowed
/admin/*	Blocked	Case-by-case	Allowed
/billing/*	Blocked	Usually blocked	Restricted
/production/customer/*	Blocked	Blocked unless contractually approved	Restricted

Audit logging

Every externalization decision should record:

* Job ID.
* Artifact hashes.
* Policy version.
* Risk class.
* Redaction transforms.
* DLP result.
* Human package hash.
* Provider selected.
* Reviewer pool type.
* Cost estimate.
* Approver policy, if any.
* Final disposition.
* Retention expiry.

Retention

Use separate retention windows:

Data	Suggested default
Raw internal artifacts	Short, project-configurable
Sanitized human packages	Shorter than raw artifacts
Provider responses	Longer if needed for audit/calibration
Worker identifiers	Minimized and provider-scoped
Aggregated metrics	Long-term
Gold/adjudicated examples	Long-term only if privacy class allows

⸻

11. Verification job lifecycle

State machine

CREATED
 -> ARTIFACTS_COLLECTED
 -> PRIVACY_CLASSIFIED
 -> SANITIZED_OR_BLOCKED
 -> SELF_VERIFYING
 -> SELF_VERIFICATION_COMPLETE
 -> DECISION_POINT
 -> FINAL_PASS
 -> AGENT_RETRY_REQUESTED
 -> FINAL_FAIL
 -> FAIL_CLOSED
 -> EXTERNAL_REVIEW_QUEUED
 -> EXTERNAL_REVIEW_RUNNING
 -> HUMAN_RESPONSES_RECEIVED
 -> CONSENSUS_RUNNING
 -> FINAL_PASS
 -> FINAL_FAIL
 -> ARTIFACT_RECAPTURE_REQUESTED
 -> ADJUDICATION_REQUIRED
 -> ADJUDICATION_RUNNING
 -> FINAL_VERDICT
 -> FEEDBACK_EMITTED
 -> CLOSED

End-to-end lifecycle

Step 1 — Agent completes work

The AI agent claims it has completed a task, such as “fix checkout button alignment” or “verify the onboarding success state.”

It submits:

* Task metadata.
* Acceptance criteria.
* Screenshots.
* DOM snapshot.
* Accessibility tree.
* Logs/traces.
* Agent-declared outcome.
* Risk hints.

The agent does not submit hidden reasoning for human review.

Step 2 — Verification job is created

The Job Intake API creates a VerificationJob.

The system records:

* Parent agent run.
* Build/commit.
* Environment.
* Browser/viewport.
* Risk tier.
* Budget and deadline.
* Acceptance criteria.
* Artifact manifest.

Step 3 — Artifacts are classified and sanitized

The Privacy Gate classifies artifacts.

Possible outcomes:

* Safe for self-verification only.
* Safe for external review after redaction.
* Safe only for internal/NDA review.
* Unsafe; fail closed or request recapture in synthetic environment.

Step 4 — Self-verification runs

The Self Verification Engine runs:

* DOM checks.
* Screenshot diffing.
* OCR/layout checks.
* Accessibility checks.
* Trace/log checks.
* Model-based visual review.
* Confidence scoring.

It emits:

* Self verdict.
* Per-criterion results.
* Confidence score.
* Failure category.
* Suggested next action.
* Privacy constraints.
* Artifact sufficiency.

Step 5 — Escalation decision

The policy engine decides:

* Pass.
* Retry.
* Fail.
* External review.
* Internal review.
* Fail closed.

This decision considers:

* Self-confidence.
* Risk tier.
* Criticality.
* Budget.
* Deadline.
* Privacy.
* Historical flakiness.
* Release-gating status.

Step 6 — External review package is prepared

If human review is allowed, the system creates a sanitized Human Work Package:

* Redacted screenshot.
* Criterion-specific task wording.
* Optional highlighted regions.
* Optional baseline/before image.
* Structured answer schema.
* Gold/attention checks if applicable.

The package is immutable once dispatched.

Step 7 — Provider routing

The External Task Broker selects a provider.

Routing criteria:

* Privacy class.
* Required reviewer pool.
* Cost cap.
* Deadline.
* Provider health.
* Required UI capabilities.
* Need for qualifications.
* Need for expert/NDA reviewers.
* Historical provider quality.

Examples:

* Low-risk objective screenshot: MTurk.
* Perception/user-research-like question: Prolific.
* Sensitive enterprise UI: managed NDA vendor or internal review.
* Urgent release-gate: internal reviewer plus backup provider.

Step 8 — Human workers respond

Workers see only observable evidence and answer structured questions.

The provider adapter collects responses and normalizes them.

Step 9 — Quality filtering

The Result Ingestion service validates responses:

* Gold checks.
* Attention checks.
* Completion time.
* Required fields.
* Annotation completeness.
* Consistency.
* Duplicate worker rules.

Bad responses are discarded or downweighted.

Step 10 — Consensus and adjudication

The Consensus Engine aggregates responses.

Outcomes:

* Pass.
* Fail.
* Artifact insufficient.
* Need more assignments.
* Need senior adjudication.

If needed, the Adjudication Service routes the case to an internal or expert reviewer.

Step 11 — Final verdict

The Verdict Ledger records:

* Final pass/fail/unclear/fail-closed.
* Per-criterion outcome.
* Severity.
* Confidence.
* Evidence links.
* Human consensus summary.
* Adjudication summary.
* Cost.
* Latency.
* Retry recommendation.

Step 12 — Feedback to agent

The Feedback Signal Bus emits a structured result.

The agent receives:

* Failed criteria.
* Severity.
* Evidence pointers.
* Screenshot annotations.
* Suspected defect category.
* Whether retry is allowed.
* Suggested repair direction.
* Whether recapture is needed.
* Budget remaining.
* Max attempts remaining.

Step 13 — Agent retries or release gate closes

If retry is allowed, the agent attempts a fix and starts a new linked verification job.

If final pass, the release gate can proceed.

If final fail or fail-closed, the release gate blocks and/or creates an issue.

⸻

12. Consensus and adjudication model

Human response normalization

Normalize every provider response into a common internal shape:

Normalized field	Example
job ID	verif_123
task ID	criterion_4_visual
provider	MTurk, Prolific, vendor, internal
reviewer pseudonymous ID	provider-scoped, not global identity
overall verdict	Pass / Fail / Unclear / Artifact insufficient
per-criterion results	criterion-level pass/fail/unclear
severity	S0–S4
defect category	layout, text, missing element, etc.
annotation	bounding box, point, region
confidence	low/medium/high
response quality flags	passed gold, too fast, incomplete, contradictory
response time	seconds
raw provider ID	stored for audit, not used by agent

Aggregation policy

Use three layers:

1. Validity filter
 Remove or downweight invalid responses.
2. Reliability-weighted consensus
 Weight workers by qualification, gold performance, adjudicated history, and task-specific accuracy.
3. Risk-aware verdict threshold
 Use stricter thresholds for high-risk and release-gating tasks.

Suggested thresholds

Scenario	Pass threshold	Fail threshold
Low-risk visual check	0.80	0.75
Normal product UI	0.90	0.80
Release-gating	0.95	0.85
Critical/security/privacy-sensitive	Human public review blocked; internal adjudication required	

These are starting points. Calibrate with historical outcomes.

Severity handling

Severity should be max-preserving.

If one highly reliable worker reports an S0 blocker with a precise annotation, do not bury it under majority vote. Route to adjudication or add quorum.

Suggested severity definitions:

Severity	Meaning
S0 Blocker	Task cannot be completed, data leak, severe wrong outcome, broken critical path.
S1 Critical	Major user-facing defect, incorrect state, severe accessibility failure, release-blocking regression.
S2 Major	Important issue with workaround or limited scope.
S3 Minor	Cosmetic or low-impact issue.
S4 Cosmetic	Tiny visual polish issue; not release-blocking unless policy says otherwise.

Adjudication triggers

Send to adjudication when:

* Human disagreement remains after max quorum.
* Minority report has high severity.
* Self-verification and human consensus disagree.
* Release-gating case has any credible fail vote.
* Artifact sufficiency is disputed.
* Privacy or compliance implication appears.
* Worker responses suggest the acceptance criteria are ambiguous.

Adjudication should be separate from provider response collection. The adjudicator reviews the normalized evidence and decides final verdict.

⸻

13. Feedback loop into the autonomous agent

The human verdict must become a machine-readable signal, not a vague comment.

Feedback signal fields

The agent should receive:

Field	Purpose
final verdict	pass, fail, unclear, fail-closed
confidence	calibrated final confidence
failed criteria	exact criterion IDs
severity	S0–S4
defect category	taxonomy label
evidence pointers	artifact IDs, screenshot regions, trace summaries
human annotations	boxes/regions/notes
machine check failures	deterministic and model check results
retry allowed	yes/no
retry reason	actionable defect, artifact issue, policy block
repair hint	non-binding, generated from taxonomy
budget state	remaining attempts/cost
policy constraints	privacy block, external review denied, internal review required

Example feedback semantics

Human finding	Agent signal
“The success toast is not visible.”	Failed criterion: success_toast_visible; category: missing element; retry: inspect toast render/timeout.
“The page is still loading.”	Artifact insufficient or app state failure; retry: wait for stable network/render or fix load issue.
“Text overlaps on mobile.”	Layout defect; include viewport, bounding box, component selector if available.
“Cannot tell because too much is redacted.”	Recapture or internal review required; do not treat as product failure.
“Button is visible but disabled.”	State defect; inspect form validation/disabled condition.

Learning loops

Use adjudicated human results to improve:

* Screenshot diff thresholds.
* OCR/layout heuristics.
* Model-review prompts/rubrics.
* Confidence calibration.
* Escalation thresholds.
* Gold-task libraries.
* Defect taxonomy.
* Agent repair strategies.
* Acceptance-criteria authoring.

Track where humans catch defects that self-verification missed. Those are false negatives and should raise future escalation probability for similar components.

Track where humans consistently pass cases that self-verification flags. Those are false positives and should lower sensitivity or improve masking.

⸻

14. Economics and operations

Budget controls

Implement hard caps at multiple levels:

Scope	Example cap
Per job	Max cost, max assignments, max retries
Per agent run	Max total external review spend
Per pull request	Max release-gate review budget
Per project/day	Daily spend ceiling
Per provider/day	Provider-specific ceiling
Per risk tier	High-risk jobs may have higher per-job budget but stricter routing
Per failure mode	Stop spending after clear fail

Cost model

Estimate before dispatch:

expected total =
 worker rewards
+ provider fees
+ premium qualification fees
+ additional quorum cost
+ adjudication cost
+ retry probability buffer

For MTurk, include reward, number of assignments, MTurk fees, and qualification-related costs. For Prolific, include participant pay, platform fees, screening costs where applicable, and operational constraints around approval/bulk operations.

Latency controls

Each job should have:

* Requested deadline.
* Max self-verification time.
* Max external queue time.
* Max assignment duration.
* Provider fallback policy.
* Expiration policy.
* Release-gate policy if deadline is missed.

Suggested defaults:

Job type	Human latency target
Non-blocking audit sample	Hours to next day
Standard uncertain QA	Tens of minutes to a few hours
Release-gating	Fast provider or internal reviewer path
Sensitive review	Internal or managed SLA

Queueing and batching

Use queues by priority and risk:

* Release-gating queue.
* Normal uncertain QA queue.
* Audit sampling queue.
* Gold-task calibration queue.
* Internal-sensitive queue.
* Dead-letter queue.

Batch only when it does not harm latency or privacy. Batch by provider, task template, reviewer pool, and risk class.

Failure handling

Failure	Response
Provider API error	Retry with backoff and idempotency.
Provider rate/load issue	Slow dispatch, use bulk endpoints if supported, or fallback provider.
Provider outage	Route to backup provider or internal queue.
No workers accept task	Raise reward, extend lifetime, change provider, or fail pending.
Low-quality responses	Add quorum, restrict qualification, update gold tasks.
Budget exhausted	Stop dispatch and fail closed or mark unverified.
Artifact expired	Recapture if possible.
Redaction failed	Block external review.
Duplicate provider callback	Idempotent ingestion.

Payment ethics

Pay for valid effort even when the worker disagrees with the final verdict.

Reject only:

* Spam.
* Non-effort.
* Failed required gold checks.
* Missing required response.
* Policy-violating behavior.

This avoids poisoning worker quality and improves long-term provider reputation.

⸻

15. Observability

Core metrics

Category	Metrics
Volume	jobs created, jobs by risk class, jobs by provider, artifacts per job
Self-verification	pass rate, fail rate, uncertain rate, check-level failure rate, model/deterministic disagreement
Escalation	escalation rate, reason distribution, privacy-block rate, fail-closed rate
Human review	provider latency, assignment completion rate, quorum size, consensus rate, disagreement rate
Quality	gold accuracy, worker reliability distribution, adjudication overturn rate
Cost	cost per job, cost per final verdict, cost per caught defect, budget cap hits
Agent loop	retry rate, retry success rate, attempts to pass, repeated failure classes
Release	release blocks, post-release escapes, false positives, false negatives
Safety	redaction detections, secret detections, externalization denials, audit events
Drift	self-vs-human disagreement over time, per-component drift, per-model-version drift

Dashboards

Create separate dashboards:

1. Verification health
 Job throughput, pass/fail/uncertain, queue depth, latency.
2. Release gate view
 Blocking jobs, pending human reviews, final verdicts, severity.
3. Provider operations
 MTurk/Prolific/vendor queue, completion rate, errors, cost, worker quality.
4. Privacy and compliance
 Redaction failures, externalization decisions, data-class distribution, audit logs.
5. Self-verifier quality
 Human disagreement, false positives, false negatives, calibration curves.
6. Agent improvement
 Common defect categories, retry success, recurring failure patterns.

Drift detection

Track drift when:

* A new UI framework or component library version lands.
* A new model reviewer version is deployed.
* Screenshot baseline changes increase.
* Human disagreement rises.
* A provider’s worker quality degrades.
* Gold-task failure rate changes.
* Post-release incidents increase after self-pass decisions.

⸻

16. MVP slice and build order

MVP scope

Start with:

* Staging/synthetic environments only.
* Redacted screenshots only.
* No production customer data.
* Objective visual QA tasks.
* One hosted task UI.
* One external provider adapter: MTurk.
* One internal reviewer fallback.
* Three-worker quorum.
* Simple weighted majority.
* Manual inspection of early adjudication.
* Hard daily and per-job cost caps.
* Feedback signal back to the agent.

Do not start with full trace externalization. Keep logs and traces internal; expose only sanitized summaries to humans.

Build order

Phase 1 — Define contracts

Define the non-code system contracts:

* VerificationJob
* ArtifactManifest
* AcceptanceCriterion
* SelfVerificationResult
* HumanReviewTask
* HumanResponse
* ConsensusResult
* FinalVerdict
* AgentFeedbackSignal
* PrivacyClassification
* ProviderCapabilities

Also define the defect taxonomy and severity scale early. Changing these later is expensive.

Phase 2 — Artifact capture and vault

Build the evidence path:

* Screenshot capture.
* DOM snapshot.
* Accessibility tree.
* Console summary.
* Network/trace summary.
* Artifact manifest.
* Immutable hashes.
* Internal-only artifact vault.
* External package derivation.

Phase 3 — Privacy gate

Before external review exists, build:

* Data classification.
* Domain allowlist.
* Environment restrictions.
* Screenshot redaction.
* Secret stripping.
* Log filtering.
* Externalization decision audit log.
* Fail-closed behavior.

This prevents later provider integrations from becoming accidental data leaks.

Phase 4 — Self-verification

Add the self-check stack:

* DOM/selector checks.
* Screenshot diff.
* OCR/text presence.
* Layout clipping/overlap checks.
* Accessibility checks.
* Trace/log checks.
* Model-based screenshot review.
* Confidence scoring.

At this phase, all uncertain jobs can simply return “needs human review” without dispatching externally.

Phase 5 — Orchestrator and escalation policy

Implement the lifecycle state machine conceptually:

* Pass.
* Fail.
* Retry.
* Human-review-needed.
* Fail-closed.
* Budget exhausted.
* Artifact recapture needed.

Add retry limits and budget controls.

Phase 6 — Internal human task UI

Before MTurk, dogfood the human-review UI internally.

Validate:

* Task wording.
* Screenshot rendering.
* Redaction quality.
* Per-criterion answers.
* Annotation capture.
* Severity taxonomy.
* Consensus output.
* Agent feedback shape.

Phase 7 — MTurk adapter

Add MTurk as the first external adapter.

Use your hosted task UI via MTurk’s external question model. Keep the adapter thin: create task, map assignments, ingest responses, approve valid submissions, expire/cancel jobs, and record costs.

Start with:

* Low-risk tasks.
* Small batches.
* Qualification filters.
* 3 assignments per task.
* Gold tasks.
* Manual approval review at first.
* Strict cost caps.
* Provider sandbox/testing before production dispatch.

Phase 8 — Consensus and adjudication

Add:

* Gold-task scoring.
* Worker reliability.
* Response validation.
* Adaptive quorum.
* Disagreement handling.
* Internal adjudication queue.
* Final verdict ledger.

Phase 9 — Agent feedback loop

Feed final results back into the autonomous agent.

Start with simple actions:

* Retry capture.
* Retry fix.
* Create issue.
* Block release.
* Mark pass.

Then add richer repair hints and historical pattern matching.

Phase 10 — Second provider

Add Prolific or a managed vendor to prove the abstraction.

This is the test of whether MTurk leaked into the core model. If the second adapter requires rewriting the job lifecycle, the abstraction is wrong.

⸻

17. Main risks and failure modes

Privacy leakage

Failure mode: Screenshot, DOM, logs, or traces expose secrets, customer data, internal URLs, unreleased features, or regulated data.

Mitigation: Deny-by-default externalization, synthetic environments, DLP, screenshot redaction, log stripping, route allowlists, canary secrets, audit logs, internal-only review for sensitive cases.

Human-review quality collapse

Failure mode: Workers answer randomly, use bots, misunderstand criteria, or optimize for speed.

Mitigation: Gold tasks, qualifications, attention checks, response validation, adaptive quorum, fair pay, worker reliability scores, provider health metrics.

Ambiguous acceptance criteria

Failure mode: Humans disagree because the question is underspecified.

Mitigation: Criteria compiler, observable-only wording, per-criterion answers, “artifact insufficient” option, rubric improvement loop.

Over-reliance on human consensus

Failure mode: Majority vote misses rare but critical defects.

Mitigation: Severity-preserving aggregation, high-reliability minority escalation, release-gate adjudication, deterministic overrides.

Over-reliance on model self-verification

Failure mode: Model reviewer confidently passes a broken UI.

Mitigation: Calibrated confidence, deterministic checks, human audit sampling, drift monitoring, model/human disagreement tracking.

Cost runaway

Failure mode: Agent loops repeatedly, creates too many human tasks, or escalates noisy checks.

Mitigation: Per-job and daily caps, stop-on-clear-fail, retry limits, batching, priority queues, provider-specific throttles.

Latency blocking releases

Failure mode: Human review takes too long for release gates.

Mitigation: Risk-based routing, internal fast lane, deadline-aware dispatch, fallback providers, fail-closed policy for critical releases.

Provider lock-in

Failure mode: MTurk HIT concepts leak into core architecture.

Mitigation: Provider-neutral job/task/assignment models, hosted task UI, capability registry, second-provider integration early.

Artifact insufficiency

Failure mode: Screenshot is blank, cropped, too redacted, still loading, or not tied to criteria.

Mitigation: Artifact-quality checks before dispatch, recapture loop, stable-render detection, criterion-to-artifact mapping.

Agent gaming the verifier

Failure mode: Agent learns to satisfy shallow checks without actually fixing the task.

Mitigation: Diverse self-checks, randomized audit sampling, human review of uncertain/high-risk cases, hidden gold-style criteria for release gates, post-release escape tracking.

Compliance mismatch

Failure mode: External provider terms, geography, retention, or subcontractor model conflicts with your data obligations.

Mitigation: Provider classification, contract review, data-processing controls, region-aware routing, retention enforcement, managed/NDA provider path.

⸻

Final recommendation

Build a Verification Control Plane with:

* A strict artifact and privacy model.
* A strong self-verification engine.
* A policy-driven escalation decision.
* A provider-agnostic External Task Broker.
* A hosted human task UI.
* Thin provider adapters.
* A separate consensus/adjudication layer.
* Machine-readable feedback to the agent.
* Budget, safety, and observability controls from day one.

Use MTurk only as the first low-risk external adapter, not as the architecture. Start with synthetic staging screenshots, objective visual criteria, redaction, three-worker quorum, gold tasks, and internal adjudication fallback. Add Prolific or a managed evaluation vendor next to validate that the abstraction is real.