import { describe, expect, it } from "vitest";
import { parseEnvironment } from "../schemas/environment";

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
});
