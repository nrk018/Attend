#!/usr/bin/env python3
"""Apply 004_student_roster_enrollment.sql. Requires DATABASE_URL."""
import os
import sys
from pathlib import Path

SQL_PATH = Path(__file__).resolve().parents[1] / "migrations" / "004_student_roster_enrollment.sql"


def main() -> int:
    url = os.environ.get("DATABASE_URL") or os.environ.get("SUPABASE_DB_URL")
    if not url:
        print("Set DATABASE_URL to your Supabase Postgres connection string, then re-run.")
        print(f"Or paste {SQL_PATH} into the Supabase SQL Editor.")
        return 1
    sql = SQL_PATH.read_text()
    try:
        import psycopg2
    except ImportError:
        print("Install psycopg2-binary to apply via DATABASE_URL, or use the Supabase SQL Editor.")
        return 1
    conn = psycopg2.connect(url)
    conn.autocommit = True
    with conn.cursor() as cur:
        cur.execute(sql)
    print("Applied 004_student_roster_enrollment.sql")
    return 0


if __name__ == "__main__":
    sys.exit(main())
