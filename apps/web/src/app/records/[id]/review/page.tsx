import Link from "next/link";
import { ReviewWorkspace } from "@/components/review-workspace";
import { getReviewData } from "@/features/medical-records/review-data";

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const data = await getReviewData(id);
  return <main className="mx-auto max-w-7xl px-6 py-10"><Link className="text-sm text-teal-700" href={`/records/${id}`}>← Record overview</Link><header className="my-6"><h1 className="text-3xl font-semibold">Review {data.document.display_name}</h1><p className="mt-2 text-slate-500">Compare each extracted fact with its exact source text before approving or correcting it.</p></header><ReviewWorkspace documentId={id} pages={data.pages} blocks={data.blocks} records={data.records} /></main>;
}
