"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  MAX_UPLOAD_BYTES,
  uploadErrorMessages,
} from "@/features/documents/validation";

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
      const response = await fetch("/api/documents", {
        method: "POST",
        body: formData,
      });
      const body = (await response.json()) as { code?: string };
      if (!response.ok) {
        setError(
          uploadErrorMessages[body.code ?? ""] ??
            "The upload failed. Please try again.",
        );
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
      <label className="block text-sm font-semibold" htmlFor="medical-record">
        Choose a document or photo
      </label>
      <input
        ref={inputRef}
        className="mt-3 block w-full rounded-lg border border-slate-300 bg-white p-3 text-sm file:mr-4 file:rounded-md file:border-0 file:bg-teal-50 file:px-4 file:py-2 file:font-semibold file:text-teal-800"
        id="medical-record"
        name="file"
        type="file"
        accept="application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp"
        required
        disabled={busy}
      />
      <p className="mt-2 text-sm text-slate-500">
        PDF, JPEG, PNG, or WEBP. Maximum 20 MB. Files stay private.
      </p>
      <button
        className="mt-5 rounded-lg bg-teal-800 px-5 py-3 font-semibold text-white hover:bg-teal-900 disabled:cursor-wait disabled:opacity-60"
        type="submit"
        disabled={busy}
      >
        {busy ? "Uploading…" : "Upload securely"}
      </button>
      {error ? (
        <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800" role="alert">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="mt-4 rounded-lg bg-teal-50 p-3 text-sm text-teal-900" role="status">
          {success}
        </p>
      ) : null}
    </form>
  );
}
