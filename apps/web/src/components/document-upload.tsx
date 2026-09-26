"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { UiIcon } from "@/components/ui-icons";
import { MAX_UPLOAD_BYTES, uploadErrorMessages } from "@/features/documents/validation";

export function DocumentUpload() {
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = inputRef.current?.files?.[0];
    if (!file) {
      setError(uploadErrorMessages.invalid_request);
      return;
    }
    if (file.size === 0) {
      setError(uploadErrorMessages.empty_file);
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(uploadErrorMessages.file_too_large);
      return;
    }

    setBusy(true);
    setError(undefined);
    setSuccess(undefined);
    const formData = new FormData();
    formData.set("file", file);

    try {
      const response = await fetch("/api/documents", { method: "POST", body: formData });
      const body = (await response.json()) as { code?: string };
      if (!response.ok) {
        setError(uploadErrorMessages[body.code ?? ""] ?? "The upload failed. Please try again.");
        return;
      }
      setSuccess("Upload complete. Your document is queued for processing.");
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
    } catch {
      setError("The upload failed. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="mt-6" onSubmit={submit}>
      <label className="group flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 px-6 py-9 text-center transition hover:border-teal-400 hover:bg-teal-50/50" htmlFor="medical-record">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white text-teal-700 shadow-sm ring-1 ring-slate-200">
          <UiIcon className="h-6 w-6" name="upload" />
        </span>
        <span className="mt-4 text-sm font-semibold text-slate-800">Choose a document or photo</span>
        <span className="mt-1 text-xs leading-5 text-slate-500">PDF, JPEG, PNG, or WEBP · Maximum 20 MB · Private by default</span>
        <input
          ref={inputRef}
          className="mt-5 block max-w-full text-sm text-slate-500 file:mr-4 file:rounded-lg file:border-0 file:bg-white file:px-4 file:py-2 file:text-sm file:font-semibold file:text-teal-800 file:shadow-sm file:ring-1 file:ring-slate-200"
          disabled={busy}
          id="medical-record"
          name="file"
          required
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp"
        />
      </label>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-slate-500">You will review extracted facts before they enter your history.</p>
        <button className="rounded-xl bg-teal-700 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-800 disabled:cursor-wait disabled:opacity-60" disabled={busy} type="submit">
          {busy ? "Uploading…" : "Upload securely"}
        </button>
      </div>
      {error ? <p className="mt-4 rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-800" role="alert">{error}</p> : null}
      {success ? <p className="mt-4 rounded-xl border border-teal-100 bg-teal-50 p-3 text-sm text-teal-900" role="status">{success}</p> : null}
    </form>
  );
}
