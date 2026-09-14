import "server-only";
import { requireUser } from "@/server/auth/require-user";

export async function buildUserExport() {
  const { supabase, user } = await requireUser();
  const [profile, documents, records, events, audits, diagnoses, medications, labs, allergies, procedures, vitals, notes] = await Promise.all([
    supabase.from("profiles").select("id,full_name,created_at,updated_at").eq("id", user.id).maybeSingle(),
    supabase.from("documents").select("id,display_name,original_filename,mime_type,file_size,sha256,document_type,event_date,processing_status,created_at,updated_at").eq("user_id", user.id).order("created_at").limit(1000),
    supabase.from("medical_records").select("id,document_id,record_type,event_date,confidence,review_status,source_page_number,extraction_method,extraction_version,created_at,updated_at").eq("user_id", user.id).in("review_status", ["approved", "corrected"]).order("created_at").limit(5000),
    supabase.from("medical_events").select("id,document_id,source_record_id,event_date,event_type,title,description,created_at").eq("user_id", user.id).order("event_date").limit(5000),
    supabase.from("audit_logs").select("id,action,resource_type,resource_id,metadata,created_at").eq("user_id", user.id).order("created_at").limit(5000),
    supabase.from("diagnoses").select("id,medical_record_id,name,code,status,diagnosed_at").eq("user_id", user.id).limit(5000),
    supabase.from("medications").select("id,medical_record_id,name,dose,dose_unit,route,frequency,start_date,end_date,status").eq("user_id", user.id).limit(5000),
    supabase.from("lab_results").select("id,medical_record_id,test_name,original_value,numeric_value,unit,reference_range,flag,specimen,collected_at").eq("user_id", user.id).limit(5000),
    supabase.from("allergies").select("id,medical_record_id,allergen,reaction,severity,status").eq("user_id", user.id).limit(5000),
    supabase.from("procedures").select("id,medical_record_id,procedure_name,performed_at,notes").eq("user_id", user.id).limit(5000),
    supabase.from("vitals").select("id,medical_record_id,label,original_value,numeric_value,unit,measured_at").eq("user_id", user.id).limit(5000),
    supabase.from("doctor_notes").select("id,medical_record_id,text").eq("user_id", user.id).limit(5000),
  ]);
  const results = [profile, documents, records, events, audits, diagnoses, medications, labs, allergies, procedures, vitals, notes];
  if (results.some((result) => result.error)) throw new Error("DATA_EXPORT_READ_FAILED");
  const trustedIds = new Set((records.data ?? []).map((record) => record.id));
  const trustedChildren = <T extends { medical_record_id: string }>(rows: T[] | null) => (rows ?? []).filter((row) => trustedIds.has(row.medical_record_id));
  return {
    format: "medmemory-user-export",
    version: 1,
    exportedAt: new Date().toISOString(),
    profile: profile.data,
    documents: documents.data ?? [],
    trustedMedicalRecords: records.data ?? [],
    timeline: events.data ?? [],
    structuredRecords: {
      diagnoses: trustedChildren(diagnoses.data), medications: trustedChildren(medications.data), labs: trustedChildren(labs.data),
      allergies: trustedChildren(allergies.data), procedures: trustedChildren(procedures.data), vitals: trustedChildren(vitals.data), notes: trustedChildren(notes.data),
    },
    auditHistory: audits.data ?? [],
    originalDocuments: { included: false, access: "Authenticated document detail and preview routes" },
  };
}
