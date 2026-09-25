import { z } from "zod";

export const publicEnvironmentSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
});

const trustedProxyHeaderSchema = z.enum([
  "cf-connecting-ip",
  "x-real-ip",
  "x-forwarded-for",
]);

const productionProcessorUrlSchema = z.url().refine((value) => {
  const url = new URL(value);
  const loopback = ["127.0.0.1", "localhost", "[::1]", "::1"].includes(url.hostname);
  return url.protocol === "https:" || (url.protocol === "http:" && loopback);
});

export const environmentSchema = publicEnvironmentSchema.extend({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  DOCUMENT_PROCESSOR_URL: z.url(),
  DOCUMENT_PROCESSOR_SECRET: z.string().min(32),
  OLLAMA_BASE_URL: z.url().optional(),
  OLLAMA_MODEL: z.string().min(1).optional(),
});

export const productionEnvironmentSchema = publicEnvironmentSchema.extend({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  DOCUMENT_PROCESSOR_URL: productionProcessorUrlSchema,
  DOCUMENT_PROCESSOR_SECRET: z.string().min(32),
  RATE_LIMIT_HASH_SECRET: z.string().min(32),
  RATE_LIMIT_TRUSTED_PROXY_HEADER: trustedProxyHeaderSchema,
});

export function parseEnvironment(input: Record<string, string | undefined>) {
  const parsed = environmentSchema.safeParse(input);
  if (!parsed.success) {
    const fields = [
      ...new Set(parsed.error.issues.map((issue) => issue.path.join("."))),
    ];
    throw new Error(
      `Invalid server configuration: ${fields.join(", ")}. See .env.example.`,
    );
  }
  return parsed.data;
}

export function parsePublicEnvironment(
  input: Record<string, string | undefined>,
) {
  const parsed = publicEnvironmentSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error("Supabase public configuration is missing.");
  }
  return parsed.data;
}

export function parseProductionEnvironment(input: Record<string, string | undefined>) {
  const parsed = productionEnvironmentSchema.safeParse(input);
  if (!parsed.success) throw new Error("PRODUCTION_CONFIGURATION_INVALID");
  return parsed.data;
}
