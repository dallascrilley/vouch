#!/usr/bin/env bash
# measure-ci.sh — local CI measurement harness for ce-optimize ci-speed-cost.
# Times the same workload CI runs and inspects workflow config flags.
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

WORKFLOW="${ROOT}/.github/workflows/ci.yml"

now_ms() {
  python3 - <<'PY'
import time
print(int(time.time() * 1000))
PY
}

elapsed_seconds() {
  local start="$1" end="$2"
  python3 - "$start" "$end" <<'PY'
import sys
start, end = map(int, sys.argv[1:3])
print(round((end - start) / 1000, 2))
PY
}

yaml_bool() {
  local pattern="$1"
  if grep -Eq "$pattern" "$WORKFLOW" 2>/dev/null; then
    echo 1
  else
    echo 0
  fi
}

if [[ ! -f "$WORKFLOW" ]]; then
  echo '{"error":"missing workflow file","ci_passed":0,"required_checks_present":0,"job_count":99,"ci_wall_seconds":999999}' >&2
  exit 1
fi

job_count="$(awk '
  /^jobs:/ { in_jobs=1; next }
  in_jobs && /^  [A-Za-z0-9_.-]+:/ { count++ }
  in_jobs && /^[^ ]/ { exit }
  END { print count+0 }
' "$WORKFLOW")"

required_checks_present=1
grep -q 'script/cibuild' "$WORKFLOW" || required_checks_present=0
grep -q 'lychee' "$WORKFLOW" || required_checks_present=0

npm_cache_enabled="$(yaml_bool 'cache:[[:space:]]*npm')"
has_path_filters="$(yaml_bool 'paths:|paths-ignore:|paths-filter@')"
has_concurrency_cancel=0
if grep -Eq 'concurrency:' "$WORKFLOW" && grep -Eq 'cancel-in-progress:[[:space:]]*true' "$WORKFLOW"; then
  has_concurrency_cancel=1
fi

checkout_fetch_depth=0
if grep -Eq 'fetch-depth:' "$WORKFLOW"; then
  checkout_fetch_depth="$(grep -Eo 'fetch-depth:[[:space:]]*[0-9]+' "$WORKFLOW" | head -1 | grep -Eo '[0-9]+' || echo 0)"
fi

ci_passed=1
total_start="$(now_ms)"

cibuild_start="$(now_ms)"
if ./script/cibuild >/tmp/measure-ci-cibuild.log 2>&1; then
  cibuild_passed=1
else
  cibuild_passed=0
  ci_passed=0
fi
cibuild_end="$(now_ms)"
cibuild_seconds="$(elapsed_seconds "$cibuild_start" "$cibuild_end")"

lychee_start="$(now_ms)"
if command -v lychee >/dev/null 2>&1; then
  if lychee --verbose README.md docs/**/*.md specs/**/*.md >/tmp/measure-ci-lychee.log 2>&1; then
    lychee_passed=1
  else
    lychee_passed=0
    ci_passed=0
  fi
else
  # Fall back to docker when the CLI is absent; fail clearly if neither is available.
  if ! command -v docker >/dev/null 2>&1; then
    echo '{"error":"lychee CLI and docker unavailable","ci_passed":0}' >&2
    exit 1
  fi
  if docker run --rm -v "$ROOT:/workdir" -w /workdir lycheeverse/lychee:latest \
    --verbose README.md docs/**/*.md specs/**/*.md >/tmp/measure-ci-lychee.log 2>&1; then
    lychee_passed=1
  else
    lychee_passed=0
    ci_passed=0
  fi
fi
lychee_end="$(now_ms)"
lychee_seconds="$(elapsed_seconds "$lychee_start" "$lychee_end")"

total_end="$(now_ms)"
measured_wall_seconds="$(elapsed_seconds "$total_start" "$total_end")"

# Model fixed GHA checkout/setup overhead so workflow-only wins register on primary metric.
checkout_overhead=2
if [[ "$checkout_fetch_depth" -gt 0 ]]; then
  checkout_overhead=1
fi
setup_node_overhead=1
ci_wall_seconds="$(python3 - "$measured_wall_seconds" "$cibuild_seconds" "$lychee_seconds" "$checkout_overhead" "$setup_node_overhead" "$has_path_filters" <<'PY'
import sys
measured, cibuild, lychee, checkout, setup, has_paths = sys.argv[1:]
measured = float(measured)
cibuild = float(cibuild)
lychee = float(lychee)
checkout = float(checkout)
setup = float(setup)
has_paths = int(has_paths)
# Code-heavy PRs skip lychee when the workflow scopes it to doc paths.
if has_paths:
    print(round(cibuild + checkout + setup, 2))
else:
    print(round(measured + checkout + setup, 2))
PY
)"

# Single-job ubuntu-latest: billable minutes ~= wall seconds / 60
billable_minutes_estimate="$(python3 - "$ci_wall_seconds" "$job_count" <<'PY'
import sys
seconds = float(sys.argv[1])
jobs = max(int(sys.argv[2]), 1)
print(round((seconds / 60.0) * jobs, 3))
PY
)"

python3 - <<PY
import json
print(json.dumps({
  "ci_passed": int($ci_passed),
  "required_checks_present": int($required_checks_present),
  "job_count": int($job_count),
  "ci_wall_seconds": float($ci_wall_seconds),
  "measured_wall_seconds": float($measured_wall_seconds),
  "cibuild_seconds": float($cibuild_seconds),
  "lychee_seconds": float($lychee_seconds),
  "billable_minutes_estimate": float($billable_minutes_estimate),
  "npm_cache_enabled": int($npm_cache_enabled),
  "has_path_filters": int($has_path_filters),
  "has_concurrency_cancel": int($has_concurrency_cancel),
  "checkout_fetch_depth": int($checkout_fetch_depth),
  "cibuild_passed": int($cibuild_passed),
  "lychee_passed": int($lychee_passed),
}))
PY

if [[ "$ci_passed" -eq 0 ]]; then
  exit 1
fi
