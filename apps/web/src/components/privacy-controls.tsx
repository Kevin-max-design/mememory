"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DeleteDocumentButton({ documentId }: { documentId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function remove() {
    if (!window.confirm("Permanently delete this document and all extracted medical data? This cannot be undone.")) return;
    setBusy(true);
    setError("");
    const response = await fetch(`/api/privacy/documents/${documentId}`, {
      method: "DELETE",
      headers: { "X-MedMemory-Confirm": "delete-document" },
    }).catch(() => null);
    if (!response?.ok) {
      setError("The document could not be deleted. Please try again.");
      setBusy(false);
      return;
    }
    router.push("/records");
    router.refresh();
  }

  return (
    <div>
      <button className="rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-50" disabled={busy} onClick={remove} type="button">
        {busy ? "Deleting…" : "Delete document"}
      </button>
      {error ? <p className="mt-2 text-sm text-red-700" role="alert">{error}</p> : null}
    </div>
  );
}

export function AccountPrivacyControls() {
  const router = useRouter();
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function removeAccount() {
    if (confirmation !== "DELETE MY ACCOUNT" || !window.confirm("Permanently delete your MedMemory account, documents, and medical data? This cannot be undone.")) return;
    setBusy(true);
    setError("");
    const response = await fetch("/api/privacy/account", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmation }),
    }).catch(() => null);
    if (!response?.ok) {
      const body = (await response?.json().catch(() => ({}))) as { code?: string } | undefined;
      setError(body?.code === "recent_sign_in_required" ? "Please sign out, sign in again, and retry within 15 minutes." : "Account deletion did not finish. Please retry; remaining data stays protected until deletion completes.");
      setBusy(false);
      return;
    }
    router.push("/login?message=account_deleted");
    router.refresh();
  }

  return (
    <section className="pt-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl bg-slate-50 p-5">
          <h2 className="font-semibold text-slate-900">Export your data</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">Download a JSON copy of your profile, document metadata, reviewed records, timeline, and audit history.</p>
          <a className="mt-4 inline-flex rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-teal-300" href="/api/privacy/export">Download export</a>
        </div>
        <div className="rounded-xl border border-red-100 bg-red-50/60 p-5">
          <h2 className="font-semibold text-red-900">Delete account</h2>
          <p className="mt-2 text-sm leading-6 text-red-800/80">Permanently deletes your account, private documents, and medical data. Type <strong>DELETE MY ACCOUNT</strong> to continue.</p>
          <input aria-label="Account deletion confirmation" className="mt-4 w-full rounded-xl border border-red-200 bg-white px-3 py-2.5 text-sm focus:border-red-400 focus:outline-none" onChange={(event) => setConfirmation(event.target.value)} value={confirmation} />
          <button className="mt-3 rounded-xl bg-red-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40" disabled={busy || confirmation !== "DELETE MY ACCOUNT"} onClick={removeAccount} type="button">{busy ? "Deleting account…" : "Delete account permanently"}</button>
          {error ? <p className="mt-2 text-sm text-red-700" role="alert">{error}</p> : null}
        </div>
      </div>
    </section>
  );
}
