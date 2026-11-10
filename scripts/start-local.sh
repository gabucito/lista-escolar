#!/usr/bin/env bash
set -euo pipefail
project_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$project_dir"
if [[ -x "$HOME/.nvm/versions/node/v24.18.0/bin/node" ]]; then
  export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"
fi
if [[ ! -d frontend/node_modules ]]; then
  npm --prefix frontend ci
fi
mkdir -p .local
python3 - <<'PY'
import socket
for port in (3000, 4200):
    with socket.socket() as probe:
        try:
            probe.bind(('127.0.0.1', port))
        except OSError:
            raise SystemExit(f'El puerto {port} está ocupado. Detén el proceso anterior antes de iniciar.')
PY
cargo build
LISTA_BIND=127.0.0.1:3000 setsid target/debug/lista-escolar serve >.local/backend.log 2>&1 &
backend_pid=$!
frontend_pid=
cleanup() {
  trap - EXIT INT TERM
  for child_pid in "$frontend_pid" "$backend_pid"; do
    if [[ -n "$child_pid" ]]; then
      kill -TERM -- "-$child_pid" 2>/dev/null || true
      wait "$child_pid" 2>/dev/null || true
    fi
  done
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
for attempt in {1..60}; do
  if ! kill -0 "$backend_pid" 2>/dev/null; then
    cat .local/backend.log
    exit 1
  fi
  if curl --silent --fail --connect-timeout 1 --max-time 2 http://127.0.0.1:3000/api/health >/dev/null; then
    break
  fi
  if [[ "$attempt" == 60 ]]; then
    printf 'El backend no respondió. Revisa .local/backend.log.\n' >&2
    exit 1
  fi
  sleep 1
done
printf 'Backend listo. Abre http://127.0.0.1:4200. Registro: .local/backend.log\n'
setsid npm --prefix frontend start &
frontend_pid=$!
wait "$frontend_pid"
