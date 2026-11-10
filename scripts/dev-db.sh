#!/usr/bin/env bash
set -euo pipefail

project_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
pg_bin=${LISTA_PG_BIN:-$(pg_config --bindir)}
data_dir="$project_dir/.local/postgres"
socket_dir="$project_dir/.local/postgres-socket"
log_file="$project_dir/.local/postgres.log"
port=${LISTA_PG_PORT:-55432}
db_user=lista_escolar
db_name=lista_escolar

start_db() {
  mkdir -p "$project_dir/.local" "$socket_dir"
  chmod 700 "$project_dir/.local" "$socket_dir"
  if [[ ! -s "$data_dir/PG_VERSION" ]]; then
    "$pg_bin/initdb" -D "$data_dir" --username="$db_user" \
      --auth-local=trust --auth-host=reject --encoding=UTF8 --no-locale >/dev/null
  fi
  if ! "$pg_bin/pg_ctl" -D "$data_dir" status >/dev/null 2>&1; then
    "$pg_bin/pg_ctl" -D "$data_dir" -l "$log_file" \
      -o "-k $socket_dir -p $port -c listen_addresses=" -w start >/dev/null
  fi
  if [[ $("$pg_bin/psql" -X -h "$socket_dir" -p "$port" -U "$db_user" \
      -d postgres -Atqc "SELECT 1 FROM pg_database WHERE datname = '$db_name'") != 1 ]]; then
    "$pg_bin/createdb" -h "$socket_dir" -p "$port" -U "$db_user" "$db_name"
  fi
  "$pg_bin/psql" -X -h "$socket_dir" -p "$port" -U "$db_user" -d "$db_name" \
    -v ON_ERROR_STOP=1 -q -f "$project_dir/db/001_catalog.sql" \
    -f "$project_dir/db/002_seed_catalog.sql"
  printf 'Local database ready: %s (socket %s, port %s)\n' "$db_name" "$socket_dir" "$port"
}

case "${1:-start}" in
  start) start_db ;;
  stop)
    if [[ -s "$data_dir/PG_VERSION" ]] && "$pg_bin/pg_ctl" -D "$data_dir" status >/dev/null 2>&1; then
      "$pg_bin/pg_ctl" -D "$data_dir" -m fast -w stop
    else
      printf 'Local database is not running.\n'
    fi
    ;;
  status)
    "$pg_bin/pg_ctl" -D "$data_dir" status
    ;;
  psql)
    shift
    exec "$pg_bin/psql" -X -h "$socket_dir" -p "$port" -U "$db_user" -d "$db_name" "$@"
    ;;
  *) printf 'Usage: %s {start|stop|status|psql}\n' "$0" >&2; exit 2 ;;
esac
