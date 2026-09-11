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
import { buildTimeline, type TimelineRecord } from "../features/timeline/builder";

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
        "lines=['Hemoglobin 13.5 g/dL 12.0-16.0','WBC 7.2 x10^3/uL 4.0-11.0','Medication: Metformin 500 mg twice daily oral','Diagnosis: Type 2 diabetes mellitus','Allergy: Penicillin - rash','BP 120/80 mmHg Pulse 72 bpm Temperature 98.6 F SpO2 98%','Procedure: Electrocardiogram']",
        "[page.insert_text((72,100+i*28),line,fontsize=11) for i,line in enumerate(lines)]",
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

    const email = `worker-e2e-${randomUUID()}@example.test`;
    const password = randomBytes(32).toString("base64url");
    const { data: created, error: userError } = await admin.auth.admin.createUser({
      email,
      password,
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

    const [document, job, pages, blocks, records] = await Promise.all([
      admin.from("documents").select("processing_status").eq("id", documentId).single(),
      admin.from("processing_jobs").select("status,attempt_count").eq("id", jobId).single(),
      admin.from("document_pages").select("id,native_text_used").eq("document_id", documentId),
      admin.from("document_text_blocks").select("id").eq("document_id", documentId),
      admin.from("medical_records").select("id,record_type,review_status,source_page_number,source_block_ids,fingerprint").eq("document_id", documentId),
    ]);
    if (
      document.error ||
      job.error ||
      pages.error ||
      blocks.error ||
      records.error ||
      document.data.processing_status !== "needs_review" ||
      job.data.status !== "completed" ||
      job.data.attempt_count !== 1 ||
      pages.data.length !== 1 ||
      !pages.data[0].native_text_used ||
      blocks.data.length < 1 ||
      records.data.length < 9 ||
      records.data.some((record) =>
        record.review_status !== "extracted" ||
        record.source_page_number !== 1 ||
        record.source_block_ids.length < 1 ||
        !record.source_block_ids.every((id) => blocks.data.some((block) => block.id === id)) ||
        !/^[a-f0-9]{64}$/.test(record.fingerprint)
      )
    ) {
      throw new Error("WORKER_PERSISTENCE_ASSERTION_FAILED");
    }

    let reviewResult: Record<string, unknown> = {};
    if (process.argv.includes("--review") || process.argv.includes("--timeline")) {
      const userClient = createClient<Database>(
        parsed.data.NEXT_PUBLIC_SUPABASE_URL,
        parsed.data.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
        { auth: { autoRefreshToken: false, persistSession: false } },
      );
      const { error: signInError } = await userClient.auth.signInWithPassword({ email, password });
      if (signInError) throw new Error("SYNTHETIC_REVIEW_SIGN_IN_FAILED");
      const corrected = records.data.find((record) => record.record_type === "lab");
      if (!corrected) throw new Error("SYNTHETIC_REVIEW_RECORD_MISSING");
      const provenanceBefore = [corrected.source_page_number, corrected.source_block_ids.join(",")];
      for (const record of records.data.filter((record) => record.id !== corrected.id)) {
        const { data: status, error: reviewError } = await userClient.rpc("review_medical_record", {
          p_document_id: documentId, p_record_id: record.id, p_action: "approve", p_correction: null,
        });
        if (reviewError || status !== "needs_review") throw new Error("SYNTHETIC_REVIEW_APPROVE_FAILED");
      }
      const { data: finalStatus, error: correctionError } = await userClient.rpc("review_medical_record", {
        p_document_id: documentId,
        p_record_id: corrected.id,
        p_action: "correct",
        p_correction: { recordType: "lab", test_name: "Hemoglobin", original_value: "13.6", numeric_value: 13.6, unit: "g/dL", reference_range: "12.0-16.0", flag: null },
      });
      const { data: after, error: afterError } = await admin.from("medical_records").select("review_status,source_page_number,source_block_ids").eq("id", corrected.id).single();
      if (correctionError || finalStatus !== "completed" || afterError || after.review_status !== "corrected" || provenanceBefore[0] !== after.source_page_number || provenanceBefore[1] !== after.source_block_ids.join(",")) {
        throw new Error("SYNTHETIC_REVIEW_CORRECTION_FAILED");
      }
      reviewResult = { review: "PASS", finalDocumentStatus: finalStatus, provenanceAfterCorrection: "verified" };
      if (process.argv.includes("--timeline")) {
        const { data: reviewed, error: reviewedError } = await admin.from("medical_records").select("id,document_id,record_type,review_status,event_date").eq("document_id", documentId);
        const recordIds = reviewed?.map((record) => record.id) ?? [];
        const childResults = await Promise.all([
          admin.from("lab_results").select("*").in("medical_record_id", recordIds), admin.from("medications").select("*").in("medical_record_id", recordIds),
          admin.from("diagnoses").select("*").in("medical_record_id", recordIds), admin.from("allergies").select("*").in("medical_record_id", recordIds),
          admin.from("vitals").select("*").in("medical_record_id", recordIds), admin.from("procedures").select("*").in("medical_record_id", recordIds),
          admin.from("doctor_notes").select("*").in("medical_record_id", recordIds),
        ]);
        if (reviewedError || childResults.some((result) => result.error)) throw new Error("SYNTHETIC_TIMELINE_READ_FAILED");
        const childMap = new Map<string, Record<string, string | number | null>>();
        for (const childResult of childResults) for (const row of childResult.data ?? []) {
          const values = { ...(row as Record<string, string | number | null>) }; const recordId = String(values.medical_record_id);
          delete values.id; delete values.medical_record_id; delete values.user_id; childMap.set(recordId, values);
        }
        const timelineRecords: TimelineRecord[] = (reviewed ?? []).map((record) => ({ id: record.id, documentId: record.document_id, recordType: record.record_type, reviewStatus: record.review_status, eventDate: record.event_date, values: childMap.get(record.id) ?? {} }));
        const timeline = buildTimeline([{ id: documentId, displayName: "Synthetic worker fixture", documentType: null, eventDate: null, createdAt: new Date().toISOString(), processingStatus: "completed" }], timelineRecords);
        if (timeline.length !== 11 || timeline.some((event) => event.reviewStatus === "extracted" || event.reviewStatus === "rejected") || timeline.some((event) => !event.sourceHref.includes(documentId))) throw new Error("SYNTHETIC_TIMELINE_ASSERTION_FAILED");
        reviewResult = { ...reviewResult, timeline: "PASS", timelineEvents: timeline.length, sourceLinks: "verified" };
      }
    }

    process.stdout.write(
      `${JSON.stringify({
        status: "PASS",
        outcome: result.outcome,
        pages: pages.data.length,
        blocks: blocks.data.length,
        records: records.data.length,
        categories: [...new Set(records.data.map((record) => record.record_type))].sort(),
        provenance: "verified",
        documentStatus: document.data.processing_status,
        jobStatus: job.data.status,
        ...reviewResult,
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
