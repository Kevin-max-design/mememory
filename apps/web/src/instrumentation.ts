import { parseProductionEnvironment } from "@/schemas/environment";

export async function register() {
  if (process.env.NODE_ENV === "production" && process.env.NEXT_RUNTIME === "nodejs") {
    parseProductionEnvironment(process.env);
  }
}
