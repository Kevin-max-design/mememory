import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { recordAuditEvent } from "@/features/audit/server";
import { getAskEvidence } from "@/features/ask/data";
import { createQAProvider } from "@/features/ask/provider";
import { requireUser } from "@/server/auth/require-user";
import { logServerEvent } from "@/features/observability/logger";

export const dynamic = "force-dynamic";

async function answerQuestion(
  question: string,
  evidence: Awaited<ReturnType<typeof getAskEvidence>>,
) {
  const startedAt = performance.now();
  try {
    const result = await createQAProvider().answer(question, evidence);
    logServerEvent({
      event: "ask.completed",
      route: "/ask",
      durationMs: Math.round(performance.now() - startedAt),
      provider: result.method,
      environment: process.env.NODE_ENV,
    });
    return result;
  } catch {
    logServerEvent({
      event: "ask.failed",
      route: "/ask",
      durationMs: Math.round(performance.now() - startedAt),
      errorCode: "ASK_PROVIDER_FAILED",
      environment: process.env.NODE_ENV,
    });
    throw new Error("ASK_PROVIDER_FAILED");
  }
}

export default async function AskPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const question = q.trim().slice(0, 300);
  const evidence = await getAskEvidence();
  const result = question ? await answerQuestion(question, evidence) : null;
  if (result) {
    const { user } = await requireUser();
    await recordAuditEvent({
      actorUserId: user.id,
      action: "ask.executed",
      resourceType: "ask",
      status: "succeeded",
      metadata: {
        result_count: result.evidence.length,
        method: result.method,
        source_route: "/ask",
      },
    });
  }
  const suggestions = [
    "What reviewed diagnoses are in my records?",
    "Which medications are listed in my reviewed records?",
    "What are my most recent lab results?",
    "Which allergies are recorded?",
    "Which procedures are in my history?",
  ];
  return (
    <AppShell
      active="ask"
      actions={
        <span className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold">
          ✧ Verified records only
        </span>
      }
      title="Ask my records"
      description="Ask about your reviewed medical history and see the supporting sources."
    >
      <section className="mx-auto mt-14 max-w-3xl text-center">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-teal-50 text-3xl text-teal-700">
          □
        </span>
        <h2 className="mt-5 text-2xl font-bold">Interactive medical memory</h2>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">
          Answers use only approved or corrected facts from your records. Every
          answer includes evidence links and may still require verification.
        </p>
      </section>
      {!question ? (
        <section className="mx-auto mt-10 max-w-3xl rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xs font-bold uppercase tracking-widest text-slate-600">
            Suggested questions
          </h2>
          <div className="mt-4 space-y-2">
            {suggestions.map((suggestion) => (
              <Link
                className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-left text-sm font-semibold text-slate-700 hover:border-teal-200 hover:bg-teal-50"
                href={`/ask?q=${encodeURIComponent(suggestion)}`}
                key={suggestion}
              >
                {suggestion}
                <span aria-hidden="true" className="text-slate-400">
                  →
                </span>
              </Link>
            ))}
          </div>
        </section>
      ) : result ? (
        <section className="mx-auto mt-10 max-w-3xl">
          <div
            className={`rounded-xl border p-6 ${result.noEvidence ? "border-amber-200 bg-amber-50" : "border-teal-200 bg-white"}`}
          >
            <h2 className="font-semibold">Answer</h2>
            <p className="mt-3 leading-7">{result.answer}</p>
            <p className="mt-3 text-xs text-slate-500">
              Method: {result.method}
            </p>
          </div>
          {result.evidence.length ? (
            <div className="mt-6">
              <h2 className="font-semibold">Evidence</h2>
              <div className="mt-3 space-y-3">
                {result.evidence.map((item) => (
                  <article
                    className="rounded-xl border border-slate-200 bg-white p-5"
                    key={item.id}
                  >
                    <div className="flex flex-wrap justify-between gap-2">
                      <span className="rounded-full bg-teal-50 px-2 py-1 text-xs font-semibold capitalize text-teal-800">
                        Reviewed {item.category}
                      </span>
                      {item.date ? (
                        <time className="text-sm text-slate-500">
                          {new Date(item.date).toLocaleDateString()}
                        </time>
                      ) : null}
                    </div>
                    <h3 className="mt-3 font-semibold">{item.title}</h3>
                    <p className="mt-2 text-sm text-slate-600">
                      {item.sourceText}
                    </p>
                    <p className="mt-2 text-xs text-slate-500">
                      Source: {item.documentName}
                      {item.pageNumber ? ` · Page ${item.pageNumber}` : ""}
                    </p>
                    <Link
                      className="mt-3 inline-block text-sm font-semibold text-teal-700"
                      href={item.sourceHref}
                    >
                      View source
                    </Link>
                  </article>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
      <form className="mx-auto mt-10 flex max-w-4xl gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-lg">
        <label className="sr-only" htmlFor="ask-question">
          Ask a question about your health records
        </label>
        <input
          autoFocus
          className="min-w-0 flex-1 rounded-xl px-4 py-3 outline-none"
          defaultValue={question}
          id="ask-question"
          maxLength={300}
          name="q"
          placeholder="Ask a question about your health records…"
        />
        <button className="rounded-xl bg-teal-700 px-5 py-3 font-semibold text-white">
          Ask
        </button>
      </form>
      <p className="mt-3 text-center text-xs text-slate-500">
        Answers are generated only from your reviewed records and are not
        medical advice.
      </p>
    </AppShell>
  );
}
