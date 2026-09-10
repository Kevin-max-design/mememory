import { logout } from "@/features/auth/actions";
import { authErrorMessage } from "@/features/auth/errors";
import { DocumentUpload } from "@/components/document-upload";
import { requireUser } from "@/server/auth/require-user";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const query = await searchParams;
  const notice = authErrorMessage(query.error);
  const { supabase, user } = await requireUser();
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();
  if (error) throw new Error("PROFILE_READ_FAILED");

  const { data: documents, error: documentsError } = await supabase
    .from("documents")
    .select("id, display_name, mime_type, file_size, processing_status, created_at")
    .order("created_at", { ascending: false });
  if (documentsError) throw new Error("DOCUMENT_LIST_FAILED");

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <header className="flex items-center justify-between border-b border-slate-200 pb-6">
        <div>
          <p className="text-sm font-semibold tracking-widest text-teal-700">
            MEDMEMORY
          </p>
          <h1 className="mt-2 text-3xl font-semibold">
            {profile?.full_name
              ? `Welcome, ${profile.full_name}`
              : "Your health archive"}
          </h1>
        </div>
        <form action={logout}>
          <button
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold"
            type="submit"
          >
            Sign out
          </button>
        </form>
      </header>
      {notice ? (
        <p
          className="mt-6 rounded-lg bg-red-50 p-3 text-sm text-red-800"
          role="alert"
        >
          {notice}
        </p>
      ) : null}
      <section className="mt-10 rounded-2xl border border-slate-200 bg-white p-8">
        <h2 className="text-xl font-semibold">Upload a medical record</h2>
        <p className="mt-2 text-slate-600">
          Add a scan, photo, or PDF to your private archive.
        </p>
        <DocumentUpload />
      </section>
      <section className="mt-8">
        <h2 className="text-xl font-semibold">Your documents</h2>
        {documents?.length ? (
          <ul className="mt-4 space-y-3">
            {documents.map((document) => (
              <li
                className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4"
                key={document.id}
              >
                <div>
                  <p className="font-semibold">{document.display_name}</p>
                  <p className="mt-1 text-sm text-slate-500">
                    {(document.file_size / 1024).toFixed(1)} KB · {document.mime_type}
                  </p>
                </div>
                <span className="rounded-full bg-amber-50 px-3 py-1 text-sm font-medium capitalize text-amber-800">
                  {document.processing_status.replace("_", " ")}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 rounded-xl border border-dashed border-slate-300 p-6 text-slate-600">
            No documents yet. Your first upload will appear here.
          </p>
        )}
      </section>
    </main>
  );
}
