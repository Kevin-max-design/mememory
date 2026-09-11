import "server-only";
import { requireUser } from "@/server/auth/require-user";
import { filterSearchResults, safeSnippet, type SearchCategory, type SearchResult } from "./model";

type ChildHit = { medical_record_id: string; category: SearchResult["category"]; title: string; snippet: string; date: string | null };

export async function searchMedicalRecords(query: string, category: SearchCategory) {
  if (!query) return [];
  const { supabase, user } = await requireUser();
  const pattern = `%${query}%`;
  const [byName, byOriginal, byType, textBlocks, labsByName, labsByValue, meds, diagnoses, allergies, vitals, procedures, notes] = await Promise.all([
    supabase.from("documents").select("id,display_name,event_date,created_at,processing_status").eq("user_id", user.id).ilike("display_name", pattern).limit(20),
    supabase.from("documents").select("id,display_name,event_date,created_at,processing_status").eq("user_id", user.id).ilike("original_filename", pattern).limit(20),
    supabase.from("documents").select("id,display_name,event_date,created_at,processing_status").eq("user_id", user.id).ilike("document_type", pattern).limit(20),
    supabase.from("document_text_blocks").select("id,document_id,page_id,text,source_type").eq("user_id", user.id).ilike("text", pattern).limit(20),
    supabase.from("lab_results").select("medical_record_id,test_name,original_value,unit,collected_at").eq("user_id", user.id).ilike("test_name", pattern).limit(20),
    supabase.from("lab_results").select("medical_record_id,test_name,original_value,unit,collected_at").eq("user_id", user.id).ilike("original_value", pattern).limit(20),
    supabase.from("medications").select("medical_record_id,name,dose,dose_unit,frequency,start_date").eq("user_id", user.id).ilike("name", pattern).limit(20),
    supabase.from("diagnoses").select("medical_record_id,name,diagnosed_at").eq("user_id", user.id).ilike("name", pattern).limit(20),
    supabase.from("allergies").select("medical_record_id,allergen,reaction").eq("user_id", user.id).ilike("allergen", pattern).limit(20),
    supabase.from("vitals").select("medical_record_id,label,original_value,unit,measured_at").eq("user_id", user.id).ilike("label", pattern).limit(20),
    supabase.from("procedures").select("medical_record_id,procedure_name,notes,performed_at").eq("user_id", user.id).ilike("procedure_name", pattern).limit(20),
    supabase.from("doctor_notes").select("medical_record_id,text").eq("user_id", user.id).ilike("text", pattern).limit(20),
  ]);
  const responses = [byName, byOriginal, byType, textBlocks, labsByName, labsByValue, meds, diagnoses, allergies, vitals, procedures, notes];
  if (responses.some((response) => response.error)) throw new Error("SEARCH_QUERY_FAILED");
  const blockRows = textBlocks.data ?? [];
  const documents = new Map([...(byName.data ?? []), ...(byOriginal.data ?? []), ...(byType.data ?? [])].map((document) => [document.id, document]));
  const childHits: ChildHit[] = [];
  for (const row of [...(labsByName.data ?? []), ...(labsByValue.data ?? [])]) childHits.push({ medical_record_id: row.medical_record_id, category: "labs", title: `${row.test_name} — ${row.original_value}${row.unit ? ` ${row.unit}` : ""}`, snippet: row.test_name, date: row.collected_at });
  for (const row of meds.data ?? []) childHits.push({ medical_record_id: row.medical_record_id, category: "medications", title: `Medication: ${row.name}${row.dose ? ` ${row.dose}${row.dose_unit ? ` ${row.dose_unit}` : ""}` : ""}`, snippet: row.frequency ? `Frequency: ${row.frequency}` : row.name, date: row.start_date });
  for (const row of diagnoses.data ?? []) childHits.push({ medical_record_id: row.medical_record_id, category: "diagnoses", title: `Diagnosis: ${row.name}`, snippet: row.name, date: row.diagnosed_at });
  for (const row of allergies.data ?? []) childHits.push({ medical_record_id: row.medical_record_id, category: "allergies", title: `Allergy: ${row.allergen}`, snippet: row.reaction ?? row.allergen, date: null });
  for (const row of vitals.data ?? []) childHits.push({ medical_record_id: row.medical_record_id, category: "vitals", title: `${row.label}: ${row.original_value}${row.unit ? ` ${row.unit}` : ""}`, snippet: row.label, date: row.measured_at });
  for (const row of procedures.data ?? []) childHits.push({ medical_record_id: row.medical_record_id, category: "procedures", title: `Procedure: ${row.procedure_name}`, snippet: row.notes ?? row.procedure_name, date: row.performed_at });
  for (const row of notes.data ?? []) childHits.push({ medical_record_id: row.medical_record_id, category: "notes", title: "Doctor note", snippet: safeSnippet(row.text, query), date: null });

  const recordIds = [...new Set(childHits.map((hit) => hit.medical_record_id))];
  const recordResponse = recordIds.length ? await supabase.from("medical_records").select("id,document_id,review_status,confidence,source_page_number,event_date").eq("user_id", user.id).in("id", recordIds).in("review_status", ["approved", "corrected"]) : { data: [], error: null };
  const documentIds = [...new Set([...blockRows.map((block) => block.document_id), ...(recordResponse.data ?? []).map((record) => record.document_id)])];
  const sourceDocuments = documentIds.length ? await supabase.from("documents").select("id,display_name,event_date,created_at,processing_status").eq("user_id", user.id).in("id", documentIds) : { data: [], error: null };
  const pageIds = [...new Set(blockRows.map((block) => block.page_id))];
  const pages = pageIds.length ? await supabase.from("document_pages").select("id,page_number").eq("user_id", user.id).in("id", pageIds) : { data: [], error: null };
  if (recordResponse.error || sourceDocuments.error || pages.error) throw new Error("SEARCH_CONTEXT_FAILED");
  for (const document of sourceDocuments.data ?? []) documents.set(document.id, document);
  const records = new Map((recordResponse.data ?? []).map((record) => [record.id, record]));
  const results: SearchResult[] = [...documents.values()].map((document) => ({ id: `document-${document.id}`, category: "documents", title: document.display_name, snippet: `Document · ${document.processing_status.replace("_", " ")}`, date: document.event_date ?? document.created_at, documentName: document.display_name, pageNumber: null, reviewStatus: document.processing_status, confidence: null, href: `/records/${document.id}`, sourceHref: null }));
  for (const block of blockRows) { const document = documents.get(block.document_id); if (!document) continue; const page = pages.data?.find((item) => item.id === block.page_id); results.push({ id: `text-${block.id}`, category: "text", title: `Text on page ${page?.page_number ?? "?"}`, snippet: safeSnippet(block.text, query), date: document.event_date ?? document.created_at, documentName: document.display_name, pageNumber: page?.page_number ?? null, reviewStatus: "source text", confidence: null, href: `/records/${block.document_id}`, sourceHref: `/records/${block.document_id}/review` }); }
  for (const hit of childHits) { const record = records.get(hit.medical_record_id); if (!record) continue; const document = documents.get(record.document_id); if (!document) continue; results.push({ id: `record-${record.id}`, category: hit.category, title: hit.title, snippet: hit.snippet, date: hit.date ?? record.event_date ?? document.event_date ?? document.created_at, documentName: document.display_name, pageNumber: record.source_page_number, reviewStatus: record.review_status, confidence: record.confidence, href: `/records/${record.document_id}`, sourceHref: `/records/${record.document_id}/review#record-${record.id}` }); }
  const unique = [...new Map(results.map((result) => [result.id, result])).values()].slice(0, 60);
  return filterSearchResults(unique, category);
}
