import { z } from "zod";

export const environmentSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  DOCUMENT_PROCESSOR_URL: z.url(),
  DOCUMENT_PROCESSOR_SECRET: z.string().min(32),
  OLLAMA_BASE_URL: z.url().optional(),
  OLLAMA_MODEL: z.string().min(1).optional(),
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
