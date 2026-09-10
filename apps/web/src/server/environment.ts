import "server-only";
import { parseEnvironment } from "@/schemas/environment";

export function getEnvironment() {
  return parseEnvironment(process.env);
}
