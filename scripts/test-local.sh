#!/usr/bin/env bash
set -euo pipefail
project_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$project_dir"
if [[ -x "$HOME/.nvm/versions/node/v24.18.0/bin/node" ]]; then
  export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"
fi
active_pid=
qa_server_pid=
cleanup() {
  trap - EXIT INT TERM
  if [[ -n "$active_pid" ]]; then
    kill -TERM -- "-$active_pid" 2>/dev/null || true
    wait "$active_pid" 2>/dev/null || true
  fi
  if [[ -n "$qa_server_pid" ]]; then
    kill -INT "$qa_server_pid" 2>/dev/null || true
    wait "$qa_server_pid" 2>/dev/null || true
  fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
run() {
  setsid "$@" &
  active_pid=$!
  wait "$active_pid"
  active_pid=
}
[[ -d frontend/node_modules ]] || run npm --prefix frontend ci
[[ -d qa/node_modules ]] || run npm --prefix qa ci
run cargo test --offline
run cargo clippy --offline --all-targets -- -D warnings
run python3 -m unittest discover -s tests -p 'test_*.py'
run npm --prefix frontend test -- --watch=false
run npm --prefix frontend run build
run cargo build --offline
run python3 tests/api_integration.py
mkdir -p .local/qa
setsid python3 tests/api_integration.py --serve >.local/qa/server.log 2>&1 &
qa_server_pid=$!
for attempt in {1..300}; do
  if ! kill -0 "$qa_server_pid" 2>/dev/null; then
    cat .local/qa/server.log
    exit 1
  fi
  if rg --quiet '^http://127\.0\.0\.1:' .local/qa/server.log; then break; fi
  if [[ "$attempt" == 300 ]]; then
    printf 'El entorno aislado no respondió. Revisa .local/qa/server.log.\n' >&2
    exit 1
  fi
  sleep .2
done
cd qa
run npx playwright test functional.spec.ts admin-account.spec.ts pdf-boundaries.spec.ts mobile.spec.ts import-scale.spec.ts editor-workspace.spec.ts catalog-browse.spec.ts catalog-expansion.spec.ts
run npx playwright test ui.spec.ts ui-admin.spec.ts pdf-workspace.spec.ts user-workflows.spec.ts --output ../.local/qa/ui-test-results --reporter=list
run node render-pdfs.mjs
printf 'Pruebas completadas. Evidencia: %s/.local/qa/. La inspección visual se registra en docs/VALIDATION.md.\n' "$project_dir"
