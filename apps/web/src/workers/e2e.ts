import { createHash, randomBytes, randomUUID } from "node:crypto";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { DocumentWorker } from "./document-worker";
import {
  SupabaseWorkerDependencies,
  workerEnvironmentSchema,
} from "./documents";

const webDirectory = fileURLToPath(new URL("../../", import.meta.url));
const repositoryDirectory = fileURLToPath(new URL("../../../../", import.meta.url));
const processorDirectory = `${repositoryDirectory}services/document-processor`;
const processorPython = `${processorDirectory}/.venv/bin/python`;

function syntheticPdf() {
  const generated = spawnSync(
    processorPython,
    [
      "-c",
      [
        "import fitz,sys",
        "document=fitz.open()",
        "page=document.new_page()",
        "page.insert_text((72,100),'Synthetic worker integration source text only.',fontsize=14)",
        "sys.stdout.buffer.write(document.tobytes())",
      ].join(";"),
    ],
    { cwd: processorDirectory, maxBuffer: 2 * 1024 * 1024 },
  );
  if (generated.status !== 0 || !generated.stdout.length) {
    throw new Error("SYNTHETIC_FIXTURE_FAILED");
  }
  return new Uint8Array(generated.stdout);
}

async function waitForProcessor(url: string, secret: string) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(new URL("/health", url), {
        headers: { "x-service-secret": secret },
      });
      if (response.ok) return;
    } catch {
      // The local process may still be starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("PROCESSOR_START_FAILED");
}

async function main() {
  config({ path: `${webDirectory}.env.local`, quiet: true });
  const parsed = workerEnvironmentSchema.safeParse(process.env);
  if (!parsed.success) throw new Error("WORKER_CONFIGURATION_INVALID");

  const processorUrl = "http://127.0.0.1:18001";
  let processor: ChildProcess | undefined;
  let userId: string | undefined;
  let storagePath: string | undefined;
  const admin = createClient<Database>(
    parsed.data.NEXT_PUBLIC_SUPABASE_URL,
    parsed.data.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  try {
    processor = spawn(
      processorPython,
      ["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "18001"],
      {
        cwd: processorDirectory,
        env: {
          ...process.env,
          DOCUMENT_PROCESSOR_SECRET: parsed.data.DOCUMENT_PROCESSOR_SECRET,
        },
        stdio: "ignore",
      },
    );
    await waitForProcessor(processorUrl, parsed.data.DOCUMENT_PROCESSOR_SECRET);

    const { data: created, error: userError } = await admin.auth.admin.createUser({
      email: `worker-e2e-${randomUUID()}@example.test`,
      password: randomBytes(32).toString("base64url"),
      email_confirm: true,
    });
    if (userError || !created.user) throw new Error("SYNTHETIC_USER_CREATE_FAILED");
    userId = created.user.id;

    const content = syntheticPdf();
    const documentId = randomUUID();
    const jobId = randomUUID();
    storagePath = `${userId}/${documentId}/original/${randomUUID()}.pdf`;
    const sha256 = createHash("sha256").update(content).digest("hex");

    const { error: storageError } = await admin.storage
      .from("medical-records")
      .upload(storagePath, content, {
        contentType: "application/pdf",
        upsert: false,
      });
    if (storageError) throw new Error("SYNTHETIC_STORAGE_CREATE_FAILED");

    const { error: documentError } = await admin.from("documents").insert({
      id: documentId,
      user_id: userId,
      original_filename: "synthetic-worker.pdf",
      display_name: "Synthetic worker fixture",
      mime_type: "application/pdf",
      file_size: content.byteLength,
      sha256,
      storage_path: storagePath,
      processing_status: "queued",
    });
    if (documentError) throw new Error("SYNTHETIC_DOCUMENT_CREATE_FAILED");
    const { error: jobError } = await admin.from("processing_jobs").insert({
      id: jobId,
      user_id: userId,
      document_id: documentId,
      job_type: "analyze",
      status: "queued",
    });
    if (jobError) throw new Error("SYNTHETIC_JOB_CREATE_FAILED");

    const dependencies = new SupabaseWorkerDependencies(
      admin,
      { ...parsed.data, DOCUMENT_PROCESSOR_URL: processorUrl },
      jobId,
    );
    const result = await new DocumentWorker(dependencies, 1_000).runOnce();
    if (result.outcome !== "completed") throw new Error("WORKER_DID_NOT_COMPLETE");

    const [document, job, pages, blocks] = await Promise.all([
      admin.from("documents").select("processing_status").eq("id", documentId).single(),
      admin.from("processing_jobs").select("status,attempt_count").eq("id", jobId).single(),
      admin.from("document_pages").select("id,native_text_used").eq("document_id", documentId),
      admin.from("document_text_blocks").select("id").eq("document_id", documentId),
    ]);
    if (
      document.error ||
      job.error ||
      pages.error ||
      blocks.error ||
      document.data.processing_status !== "needs_review" ||
      job.data.status !== "completed" ||
      job.data.attempt_count !== 1 ||
      pages.data.length !== 1 ||
      !pages.data[0].native_text_used ||
      blocks.data.length < 1
    ) {
      throw new Error("WORKER_PERSISTENCE_ASSERTION_FAILED");
    }

    process.stdout.write(
      `${JSON.stringify({
        status: "PASS",
        outcome: result.outcome,
        pages: pages.data.length,
        blocks: blocks.data.length,
        documentStatus: document.data.processing_status,
        jobStatus: job.data.status,
      })}\n`,
    );
  } finally {
    if (storagePath) {
      await admin.storage.from("medical-records").remove([storagePath]);
    }
    if (userId) await admin.auth.admin.deleteUser(userId);
    processor?.kill("SIGTERM");
  }
}

void main().catch(() => {
  process.stderr.write("Synthetic worker integration test failed.\n");
  process.exitCode = 1;
});
