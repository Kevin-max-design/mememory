"""Development migration runner. Credentials never enter command arguments or logs."""
import argparse
import hashlib
from pathlib import Path

import psycopg
from dotenv import dotenv_values
from pglast import parse_sql

ROOT = Path(__file__).resolve().parents[1]
PROJECT = "ftshvrcaeqbxnewvkamj"


def connect():
    config = dotenv_values(ROOT / ".env.database.local")
    password = config.get("SUPABASE_DB_PASSWORD")
    if not password:
        raise SystemExit("BLOCKED: set SUPABASE_DB_PASSWORD in .env.database.local")
    if config.get("SUPABASE_PROJECT_REF") != PROJECT:
        raise SystemExit("Refusing to connect: development project reference mismatch")
    return psycopg.connect(
        host="aws-0-ap-northeast-1.pooler.supabase.com", port=5432,
        dbname="postgres", user=f"postgres.{PROJECT}", password=password,
        sslmode="verify-full", sslrootcert=ROOT / ".supabase-ca.crt", connect_timeout=15,
    )


def validate():
    files = sorted((ROOT / "supabase/migrations").glob("*.sql"))
    for file in files:
        statements = parse_sql(file.read_text())
        print(f"PARSED {file.name}: {len(statements)} statements (not database execution)")
    return files


def apply():
    files = validate()
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
    with connect() as db:
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


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=["validate", "apply", "inspect", "test"])
    action = parser.parse_args().action
    if action == "validate":
        validate()
    elif action == "apply":
        apply()
    elif action == "inspect":
        inspect()
    else:
        from database_security import run
        with connect() as connection:
            run(connection)
