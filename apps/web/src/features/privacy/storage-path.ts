import { z } from "zod";

const uuid = z.uuid();
const generatedObject = /^[a-f0-9-]+\.(pdf|jpg|png|webp)$/;
const normalizedObject = /^[a-f0-9.-]+$/;

export function ownedDocumentStoragePaths(input: {
  userId: string;
  documentId: string;
  storagePath: string;
  normalizedStoragePath?: string | null;
}) {
  if (!uuid.safeParse(input.userId).success || !uuid.safeParse(input.documentId).success) return null;
  const originalPrefix = `${input.userId}/${input.documentId}/original/`;
  const normalizedPrefix = `${input.userId}/${input.documentId}/normalized/`;
  if (!input.storagePath.startsWith(originalPrefix) || !generatedObject.test(input.storagePath.slice(originalPrefix.length))) return null;
  const paths = [input.storagePath];
  if (input.normalizedStoragePath) {
    if (!input.normalizedStoragePath.startsWith(normalizedPrefix) || !normalizedObject.test(input.normalizedStoragePath.slice(normalizedPrefix.length))) return null;
    paths.push(input.normalizedStoragePath);
  }
  return paths;
}
