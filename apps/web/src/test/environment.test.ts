import { describe, expect, it } from "vitest";
import { parseEnvironment, parseProductionEnvironment } from "../schemas/environment";

const configuration = {
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test-publishable",
  DOCUMENT_PROCESSOR_URL: "http://127.0.0.1:8000",
  DOCUMENT_PROCESSOR_SECRET: "s".repeat(32),
};
describe("server configuration", () => {
  it("does not require an AI provider", () => {
    expect(parseEnvironment(configuration).OLLAMA_MODEL).toBeUndefined();
  });
  it("reports missing fields without revealing values", () => {
    expect(() =>
      parseEnvironment({
        ...configuration,
        DOCUMENT_PROCESSOR_URL: "private-invalid-value",
      }),
    ).toThrow(
      "Invalid server configuration: DOCUMENT_PROCESSOR_URL. See .env.example.",
    );
  });
  it("rejects missing mandatory configuration", () => {
    expect(() => parseEnvironment({})).toThrow("Invalid server configuration");
  });
  it("validates all production-only secrets without exposing their values", () => {
    const production = { ...configuration, SUPABASE_SERVICE_ROLE_KEY: "x".repeat(32), RATE_LIMIT_HASH_SECRET: "r".repeat(32) };
    expect(parseProductionEnvironment(production).RATE_LIMIT_HASH_SECRET).toHaveLength(32);
    expect(() => parseProductionEnvironment({ ...production, RATE_LIMIT_HASH_SECRET: "private-short" })).toThrow("PRODUCTION_CONFIGURATION_INVALID");
  });
});
