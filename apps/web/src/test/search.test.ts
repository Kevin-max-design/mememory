import { describe, expect, it } from "vitest";
import { filterSearchResults, safeSnippet, searchRequestSchema, type SearchResult } from "@/features/search/model";

function result(category: SearchResult["category"]): SearchResult { return { id: "r1", category, title: "Hemoglobin", snippet: "13.2 g/dL", date: null, documentName: "CBC", pageNumber: 1, reviewStatus: "approved", confidence: .9, href: "/records/d1", sourceHref: "/records/d1/review#record-r1" }; }

describe("medical records search", () => {
  it("normalizes bounded queries and removes wildcard controls", () => {
    expect(searchRequestSchema.parse({ q: "%Hemo_", category: "all" }).q).toBe("Hemo");
    expect(searchRequestSchema.safeParse({ q: "x".repeat(81), category: "all" }).success).toBe(false);
  });
  it("filters grouped result categories", () => {
    expect(filterSearchResults([result("labs"), result("documents")], "labs")).toEqual([result("labs")]);
  });
  it("creates bounded contextual snippets", () => {
    const snippet = safeSnippet(`${"prefix ".repeat(50)}needle${" suffix".repeat(50)}`, "needle");
    expect(snippet).toContain("needle"); expect(snippet.length).toBeLessThanOrEqual(222);
  });
  it("keeps exact record and provenance links", () => {
    expect(result("labs")).toMatchObject({ href: "/records/d1", sourceHref: "/records/d1/review#record-r1" });
  });
});
