import { z } from "zod";

export const searchCategories = ["all", "documents", "text", "labs", "medications", "diagnoses", "allergies", "vitals", "procedures", "notes"] as const;
export type SearchCategory = (typeof searchCategories)[number];

export const searchRequestSchema = z.object({
  q: z.string().trim().max(80).transform((value) => value.replace(/[%_]/g, "")),
  category: z.enum(searchCategories).default("all"),
});

export type SearchResult = {
  id: string; category: Exclude<SearchCategory, "all">; title: string; snippet: string;
  date: string | null; documentName: string; pageNumber: number | null;
  reviewStatus: string; confidence: number | null; href: string; sourceHref: string | null;
};

export function filterSearchResults(results: SearchResult[], category: SearchCategory) {
  return category === "all" ? results : results.filter((result) => result.category === category);
}

export function safeSnippet(text: string, query: string, maximum = 220) {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= maximum) return compact;
  const at = compact.toLowerCase().indexOf(query.toLowerCase());
  const start = Math.max(0, at < 0 ? 0 : at - Math.floor(maximum / 3));
  return `${start ? "…" : ""}${compact.slice(start, start + maximum)}…`;
}
