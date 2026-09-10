# Development operations

Supabase project: medmemory-dev, reference ftshvrcaeqbxnewvkamj.
Region: Tokyo (ap-northeast-1). This project was created for development in this task.
The dashboard's default main branch label says PRODUCTION; that does not change its
user-authorized development purpose. No real patient data should be used during tests.

## Database setup and migrations

1. Enter the database password in .env.database.local (Git-ignored).
2. Install developer database tooling:
   `services/document-processor/.venv/bin/python -m pip install -r scripts/requirements.txt`
3. Syntax check: `services/document-processor/.venv/bin/python scripts/database.py validate`
4. Inspect target: `services/document-processor/.venv/bin/python scripts/database.py inspect`
5. Apply: `services/document-processor/.venv/bin/python scripts/database.py apply`
6. Inspect again, then run: `services/document-processor/.venv/bin/python scripts/database.py test`

The runner locks migration application and records SHA-256 checksums in the private
medmemory_migrations schema. Changed already-applied migrations fail rather than
silently drifting. Migration files run together in a transaction; failure rolls back.
Do not mix this runner with manual schema edits. This ledger is separate from the
Supabase CLI migration ledger. It does not claim migrations have been applied by CLI.

Database types are generated with `node scripts/generate-types.mjs`. The generator uses
the local database password and Supabase root certificate without putting credentials
in process arguments. Re-run it after every deployed migration. Syntax parsing alone
does not validate PL/pgSQL bodies, grants, or runtime behavior, so the real database
inspection and security test remain mandatory gates.

## Local services

See README.md. `python3 scripts/smoke-foundation.py` uses synthetic environment values
to verify HTTP startup, then stops both processes. It does not verify database access.
The production build uses supported Webpack because Turbopack's CSS worker encountered
local port restrictions in this host environment.
