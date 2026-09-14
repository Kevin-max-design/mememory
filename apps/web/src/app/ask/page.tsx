import Link from "next/link";
import { recordAuditEvent } from "@/features/audit/server";
import { getAskEvidence } from "@/features/ask/data";
import { createQAProvider } from "@/features/ask/provider";
import { requireUser } from "@/server/auth/require-user";
import { logServerEvent } from "@/features/observability/logger";

export const dynamic = "force-dynamic";

async function answerQuestion(question: string, evidence: Awaited<ReturnType<typeof getAskEvidence>>) {
  const startedAt = performance.now();
  try {
    const result = await createQAProvider().answer(question, evidence);
    logServerEvent({ event: "ask.completed", route: "/ask", durationMs: Math.round(performance.now() - startedAt), provider: result.method, environment: process.env.NODE_ENV });
    return result;
  } catch {
    logServerEvent({ event: "ask.failed", route: "/ask", durationMs: Math.round(performance.now() - startedAt), errorCode: "ASK_PROVIDER_FAILED", environment: process.env.NODE_ENV });
    throw new Error("ASK_PROVIDER_FAILED");
  }
}

export default async function AskPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams; const question = q.trim().slice(0, 300);
  const evidence = await getAskEvidence();
  const result = question ? await answerQuestion(question, evidence) : null;
  if (result) { const { user } = await requireUser(); await recordAuditEvent({ actorUserId: user.id, action: "ask.executed", resourceType: "ask", status: "succeeded", metadata: { result_count: result.evidence.length, method: result.method, source_route: "/ask" } }); }
  return <main className="mx-auto max-w-4xl px-6 py-12"><header className="flex items-center justify-between gap-4"><div><p className="text-sm font-semibold tracking-widest text-teal-700">MEDMEMORY</p><h1 className="mt-2 text-3xl font-semibold">Ask MedMemory</h1><p className="mt-2 text-slate-600">Answers are based only on your stored reviewed records.</p></div><Link className="rounded-lg border px-4 py-2" href="/dashboard">Dashboard</Link></header>
    <form className="mt-8 rounded-xl border border-slate-200 bg-white p-5"><label className="font-semibold">Your question<input autoFocus className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-3 font-normal" defaultValue={question} maxLength={300} name="q" placeholder="What medicines have I taken?" /></label><button className="mt-4 rounded-lg bg-teal-700 px-5 py-3 font-semibold text-white">Ask</button></form>
    {!question ? <section className="mt-8 rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-600">Ask about medications, lab results, diagnoses, allergies, procedures, vitals, or documents.</section> : result ? <section className="mt-8"><div className={`rounded-xl border p-6 ${result.noEvidence ? "border-amber-200 bg-amber-50" : "border-teal-200 bg-white"}`}><h2 className="font-semibold">Answer</h2><p className="mt-3 leading-7">{result.answer}</p><p className="mt-3 text-xs text-slate-500">Method: {result.method}</p></div>{result.evidence.length ? <div className="mt-6"><h2 className="font-semibold">Evidence</h2><div className="mt-3 space-y-3">{result.evidence.map((item) => <article className="rounded-xl border border-slate-200 bg-white p-5" key={item.id}><div className="flex flex-wrap justify-between gap-2"><span className="rounded-full bg-teal-50 px-2 py-1 text-xs font-semibold capitalize text-teal-800">Reviewed {item.category}</span>{item.date ? <time className="text-sm text-slate-500">{new Date(item.date).toLocaleDateString()}</time> : null}</div><h3 className="mt-3 font-semibold">{item.title}</h3><p className="mt-2 text-sm text-slate-600">{item.sourceText}</p><p className="mt-2 text-xs text-slate-500">Source: {item.documentName}{item.pageNumber ? ` · Page ${item.pageNumber}` : ""}</p><Link className="mt-3 inline-block text-sm font-semibold text-teal-700" href={item.sourceHref}>View source</Link></article>)}</div></div> : null}</section> : null}
  </main>;
}
