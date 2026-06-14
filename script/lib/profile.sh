#!/usr/bin/env bash
#
# Language profile: Node.js / TypeScript (npm).
# Sourced by script/lib/common.sh. Define each run_* command here; the universal
# script/* entrypoints call them. This is the ONLY file that varies by language.
#
# Lockfile is law: package-lock.json → npm ci. CI runs build:js + verify.

run_bootstrap() {
  command -v node >/dev/null 2>&1 || die "node not found — install Node 24+ (mise install)"
  case "$(node -p "process.versions.node.split('.')[0]")" in
    24|25|26) ;;
    *) die "Node 24+ required (engines in package.json); got $(node -v)";;
  esac
}

run_setup()  { run_bootstrap; npm ci; }
run_update() { run_bootstrap; npm ci; }
run_server() { run_bootstrap; npm run dev; }
run_test()   { run_bootstrap; npm test "$@"; }

run_cibuild() {
  run_bootstrap
  command -v ruby >/dev/null 2>&1 || die "ruby not found — required for OpenAPI version check in cibuild"
  npm ci --no-audit --no-fund
  npm run build:js
  npm run verify
  ruby -ryaml -e 'data = YAML.load_file("specs/001-verification-control-plane/contracts/openapi.yaml"); abort("openapi version mismatch") unless data["openapi"] == "3.1.0"'
}

run_console() { node; }
