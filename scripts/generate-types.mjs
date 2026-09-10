import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { parse } from 'dotenv';
import pg from 'pg';
import { introspect, generateTypescript, sortGeneratorMetadata } from '@supabase/postgrest-typegen';

const config = parse(await readFile(new URL('../.env.database.local', import.meta.url)));
const rootCertificate = await readFile(new URL('../.supabase-ca.crt', import.meta.url), 'utf8');
if (!config.SUPABASE_DB_PASSWORD || config.SUPABASE_PROJECT_REF !== 'ftshvrcaeqbxnewvkamj') {
  throw new Error('Development database configuration missing or mismatched');
}
const pool = new pg.Pool({
  host: 'aws-0-ap-northeast-1.pooler.supabase.com', port: 5432,
  user: `postgres.${config.SUPABASE_PROJECT_REF}`, password: config.SUPABASE_DB_PASSWORD,
  database: 'postgres', ssl: { ca: rootCertificate, rejectUnauthorized: true }, max: 1,
  connectionTimeoutMillis: 15000, query_timeout: 60000,
});
try {
  const metadata = await introspect(pool, { includedSchemas: ['public'] });
  const types = await generateTypescript(sortGeneratorMetadata(metadata), { detectOneToOneRelationships: true });
  await mkdir('apps/web/src/types', { recursive: true });
  await writeFile('apps/web/src/types/database.types.ts', '// Generated from deployed schema by Supabase postgrest-typegen. Do not edit.\n' + types);
  console.log('Generated Supabase database types from the development schema');
} finally {
  await pool.end();
}
