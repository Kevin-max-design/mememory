"""Development migration runner. Credentials never enter command arguments or logs."""
import argparse
import hashlib
from pathlib import Path

import psycopg
from dotenv import dotenv_values
from pglast import parse_sql

ROOT = Path(__file__).resolve().parents[1]
PROJECT = "ftshvrcaeqbxnewvkamj"


def connect(*, read_only=False):
    config = dotenv_values(ROOT / ".env.database.local")
    password = config.get("SUPABASE_DB_PASSWORD")
    if not password:
        raise SystemExit("BLOCKED: set SUPABASE_DB_PASSWORD in .env.database.local")
    if config.get("SUPABASE_PROJECT_REF") != PROJECT:
        raise SystemExit("Refusing to connect: development project reference mismatch")
    connection = psycopg.connect(
        host="aws-0-ap-northeast-1.pooler.supabase.com", port=5432,
        dbname="postgres", user=f"postgres.{PROJECT}", password=password,
        sslmode="verify-full", sslrootcert=ROOT / ".supabase-ca.crt", connect_timeout=15,
    )
    if read_only:
        connection.autocommit = True
        connection.execute("set default_transaction_read_only=on")
    return connection


def validate(target_only=None):
    files = sorted((ROOT / "supabase/migrations").glob("*.sql"))
    if target_only:
        files = [f for f in files if f.name == target_only]
        if not files:
            raise SystemExit(f"Migration file {target_only} not found")
    for file in files:
        statements = parse_sql(file.read_text())
        print(f"PARSED {file.name}: {len(statements)} statements (not database execution)")
    return files


def apply(target_only=None):
    files = validate(target_only=target_only)
    with connect() as db:
        db.execute("select pg_advisory_xact_lock(821496331)")
        db.execute("create schema if not exists medmemory_migrations")
        db.execute("revoke all on schema medmemory_migrations from public,anon,authenticated")
        db.execute("""create table if not exists medmemory_migrations.applied (
            version text primary key, sha256 text not null, applied_at timestamptz not null default now())""")
        for file in files:
            source = file.read_text()
            digest = hashlib.sha256(source.encode()).hexdigest()
            previous = db.execute("select sha256 from medmemory_migrations.applied where version=%s", (file.name,)).fetchone()
            if previous:
                if previous[0] != digest:
                    raise SystemExit(f"Migration drift detected: {file.name}")
                print(f"UNCHANGED {file.name}")
                continue
            db.execute(source)
            db.execute("insert into medmemory_migrations.applied(version,sha256) values(%s,%s)", (file.name,digest))
            print(f"APPLIED (pending transaction commit) {file.name}")
    print("Migration transaction committed")


def inspect():
    with connect(read_only=True) as db:
        if not db.pgconn.ssl_in_use:
            raise SystemExit("Database connection is not protected by TLS")
        print(f"database target: {PROJECT}; verified TLS=True")
        rows = db.execute("""select c.relname,c.relrowsecurity from pg_class c
            join pg_namespace n on n.oid=c.relnamespace
            where n.nspname='public' and c.relkind='r' order by c.relname""").fetchall()
        for name, rls in rows:
            print(f"{name}: RLS={rls}")
        bucket = db.execute("select public,file_size_limit from storage.buckets where id='medical-records'").fetchone()
        print(f"medical-records bucket: {bucket}")


def verify():
    """Report metadata and counts only, through a database-enforced read-only session."""
    local = dotenv_values(ROOT / ".env.database.local")
    web = dotenv_values(ROOT / "apps/web/.env.local")
    expected_url = f"https://{PROJECT}.supabase.co"
    print(f"database environment target matches intended project: {local.get('SUPABASE_PROJECT_REF') == PROJECT}")
    print(f"web environment target matches intended project: {web.get('NEXT_PUBLIC_SUPABASE_URL') == expected_url}")

    local_files = sorted((ROOT / "supabase/migrations").glob("*.sql"))
    with connect(read_only=True) as db:
        if not db.pgconn.ssl_in_use:
            raise SystemExit("Database connection is not protected by TLS")
        read_only = db.execute("show default_transaction_read_only").fetchone()[0]
        if read_only != "on":
            raise SystemExit("Verification connection is not read-only")
        print(f"project ref: {PROJECT}; verified TLS=True; database session read-only=True")

        applied = {
            row[0]
            for row in db.execute(
                "select version from medmemory_migrations.applied order by version"
            ).fetchall()
        }
        for file in local_files:
            state = "applied" if file.name in applied else "pending"
            print(f"migration {file.name}: {state}")

        counts = {
            "auth.users": db.execute("select count(*) from auth.users").fetchone()[0],
            "storage.objects": db.execute("select count(*) from storage.objects").fetchone()[0],
        }
        tables = db.execute(
            """select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
               where n.nspname='public' and c.relkind='r' order by c.relname"""
        ).fetchall()
        for (table,) in tables:
            counts[f"public.{table}"] = db.execute(
                psycopg.sql.SQL("select count(*) from public.{}").format(
                    psycopg.sql.Identifier(table)
                )
            ).fetchone()[0]
        for name, count in counts.items():
            print(f"row count {name}: {count}")
        for status, count in db.execute(
            "select status, count(*) from public.processing_jobs group by status order by status"
        ).fetchall():
            print(f"processing job status {status}: {count}")
        for status, count in db.execute(
            "select processing_status, count(*) from public.documents "
            "group by processing_status order by processing_status"
        ).fetchall():
            print(f"document processing status {status}: {count}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=["validate", "apply", "inspect", "verify", "test"])
    parser.add_argument("--only", help="Target a specific migration filename")
    args = parser.parse_args()
    if args.action == "validate":
        validate(target_only=args.only)
    elif args.action == "apply":
        apply(target_only=args.only)
    elif args.action == "inspect":
        inspect()
    elif args.action == "verify":
        verify()
    else:
        from database_security import run
        with connect() as connection:
            run(connection)
