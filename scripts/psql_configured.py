#!/usr/bin/env python3
"""Connect psql using the single explicit target in a protected pgpass file."""

import argparse
import os
from pathlib import Path
import subprocess
import sys


def parse_pgpass_target(path: Path) -> tuple[str, str, str, str]:
    if path.stat().st_mode & 0o077:
        raise ValueError("The PostgreSQL password file must not be accessible to group or others; use chmod 600.")
    lines = [line for line in path.read_text(encoding="utf-8").splitlines() if line and not line.startswith("#")]
    if len(lines) != 1:
        raise ValueError("The PostgreSQL password file must contain exactly one non-comment connection line.")
    fields: list[str] = []
    current: list[str] = []
    escaped = False
    for char in lines[0]:
        if escaped:
            current.append(char)
            escaped = False
        elif char == "\\":
            escaped = True
        elif char == ":":
            fields.append("".join(current))
            current = []
        else:
            current.append(char)
    if escaped:
        raise ValueError("The PostgreSQL password file ends with an incomplete escape.")
    fields.append("".join(current))
    if len(fields) != 5 or any(not value for value in fields):
        raise ValueError("Expected host:port:database:username:password in the PostgreSQL password file.")
    if any(value == "*" for value in fields[:4]):
        raise ValueError("Use an explicit host, port, database and username, not wildcards.")
    if not fields[1].isdigit() or not 1 <= int(fields[1]) <= 65535:
        raise ValueError("The PostgreSQL port must be a number between 1 and 65535.")
    if any(value.startswith("YOUR_DB_") for value in fields[2:]):
        raise ValueError("Replace the PostgreSQL connection placeholders before connecting.")
    return tuple(fields[:4])


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pgpass", type=Path, default=Path(__file__).resolve().parents[1] / ".local/pgpass")
    parser.add_argument("psql_args", nargs=argparse.REMAINDER, help="arguments forwarded to psql")
    args = parser.parse_args()
    try:
        host, port, database, user = parse_pgpass_target(args.pgpass)
    except (OSError, ValueError) as error:
        parser.error(str(error))
    forwarded = args.psql_args
    if forwarded and forwarded[0] == "--":
        forwarded = forwarded[1:]
    environment = os.environ.copy()
    # A pre-existing PGPASSWORD would override the password file in libpq.
    environment.pop("PGPASSWORD", None)
    environment["PGPASSFILE"] = str(args.pgpass.resolve())
    command = ["psql", "-X", "-w", "-v", "ON_ERROR_STOP=1", "-h", host, "-p", port, "-U", user, "-d", database]
    result = subprocess.run(command + forwarded, env=environment)
    sys.exit(result.returncode)


if __name__ == "__main__":
    main()
