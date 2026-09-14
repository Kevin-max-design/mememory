import "server-only";

export type SafeLogFields = {
  event: string;
  requestId?: string;
  route?: string;
  httpStatus?: number;
  durationMs?: number;
  errorCode?: string;
  jobId?: string;
  documentId?: string;
  provider?: string;
  retryCount?: number;
  environment?: string;
};

const textPatterns: Record<string, RegExp> = {
  event: /^[a-z0-9_.-]{1,80}$/,
  requestId: /^[A-Za-z0-9_-]{1,80}$/,
  route: /^\/[A-Za-z0-9_./:[\]-]{0,120}$/,
  errorCode: /^[A-Z0-9_]{3,100}$/,
  jobId: /^[0-9a-f-]{36}$/i,
  documentId: /^[0-9a-f-]{36}$/i,
  provider: /^[A-Za-z0-9_.-]{1,100}$/,
  environment: /^(development|test|production)$/,
};

export function sanitizeLogFields(input: Record<string, unknown>): SafeLogFields | null {
  if (typeof input.event !== "string" || !textPatterns.event.test(input.event)) return null;
  const output: Record<string, string | number> = { event: input.event };
  for (const [key, pattern] of Object.entries(textPatterns)) {
    if (key === "event") continue;
    const value = input[key];
    if (typeof value === "string" && pattern.test(value)) output[key] = value;
  }
  for (const key of ["httpStatus", "durationMs", "retryCount"] as const) {
    const value = input[key];
    if (typeof value === "number" && Number.isInteger(value) && value >= 0) output[key] = value;
  }
  return output as SafeLogFields;
}

export function logServerEvent(fields: SafeLogFields, sink: (line: string) => void = console.info) {
  const safe = sanitizeLogFields(fields);
  if (!safe) return false;
  sink(JSON.stringify(safe));
  return true;
}
