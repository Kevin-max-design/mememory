import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

describe("launch-facing safety and access", () => {
  it("publishes privacy, terms, support, and medical limitation pages", () => {
    expect(source("src/app/privacy/page.tsx")).toContain("Privacy Policy");
    expect(source("src/app/terms/page.tsx")).toContain("Not medical advice");
    expect(source("src/app/support/page.tsx")).toContain("Medical emergency?");
    const footer = source("src/components/public-shell.tsx");
    expect(footer).toContain('href="/privacy"');
    expect(footer).toContain('href="/terms"');
    expect(footer).toContain('href="/support"');
  });

  it("enforces a baseline browser security policy", () => {
    const config = source("next.config.ts");
    expect(config).toContain("Content-Security-Policy");
    expect(config).toContain("object-src 'none'");
    expect(config).toContain("frame-ancestors 'self'");
    expect(config).toContain("Strict-Transport-Security");
  });

  it("keeps the landing page aligned with the shipped review-first flow", () => {
    const home = source("src/app/page.tsx");
    expect(home).toContain("Review before relying");
    expect(home).toContain("Source-linked");
    expect(home).not.toContain("next release gate");
  });
});
