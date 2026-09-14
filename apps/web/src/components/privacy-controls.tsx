"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DeleteDocumentButton({ documentId }: { documentId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function remove() {
    if (!window.confirm("Permanently delete this document and all extracted medical data? This cannot be undone.")) return;
    setBusy(true); setError("");
    const response = await fetch(`/api/privacy/documents/${documentId}`, { method: "DELETE", headers: { "X-MedMemory-Confirm": "delete-document" } }).catch(() => null);
    if (!response?.ok) { setError("The document could not be deleted. Please try again."); setBusy(false); return; }
    router.push("/records"); router.refresh();
  }
  return <div><button className="rounded-lg border border-red-300 px-4 py-2 font-semibold text-red-700 disabled:opacity-50" disabled={busy} onClick={remove} type="button">{busy ? "Deleting…" : "Delete document"}</button>{error ? <p className="mt-2 text-sm text-red-700" role="alert">{error}</p> : null}</div>;
}

export function AccountPrivacyControls() {
  const router = useRouter();
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function removeAccount() {
    if (confirmation !== "DELETE MY ACCOUNT" || !window.confirm("Permanently delete your MedMemory account, documents, and medical data? This cannot be undone.")) return;
    setBusy(true); setError("");
    const response = await fetch("/api/privacy/account", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmation }) }).catch(() => null);
    if (!response?.ok) {
      const body = await response?.json().catch(() => ({})) as { code?: string } | undefined;
      setError(body?.code === "recent_sign_in_required" ? "Please sign out, sign in again, and retry within 15 minutes." : "Account deletion did not finish. Please retry; remaining data will stay inaccessible only after deletion completes."); setBusy(false); return;
    }
    router.push("/login?message=account_deleted"); router.refresh();
  }
  return <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6"><h2 className="text-xl font-semibold">Privacy controls</h2><p className="mt-2 text-sm text-slate-600">Download a JSON copy of your profile, document metadata, reviewed records, timeline, and audit history.</p><a className="mt-4 inline-block rounded-lg border border-teal-700 px-4 py-2 text-sm font-semibold text-teal-700" href="/api/privacy/export">Export my data</a><div className="mt-8 border-t pt-6"><h3 className="font-semibold text-red-800">Delete account</h3><p className="mt-2 text-sm text-slate-600">This permanently deletes your account, private documents, and medical data. Type <strong>DELETE MY ACCOUNT</strong> to continue.</p><input aria-label="Account deletion confirmation" className="mt-3 w-full max-w-sm rounded-lg border px-3 py-2" onChange={(event) => setConfirmation(event.target.value)} value={confirmation} /><br/><button className="mt-3 rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={busy || confirmation !== "DELETE MY ACCOUNT"} onClick={removeAccount} type="button">{busy ? "Deleting account…" : "Delete my account permanently"}</button>{error ? <p className="mt-2 text-sm text-red-700" role="alert">{error}</p> : null}</div></section>;
}
