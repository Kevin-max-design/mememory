export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { getSupabasePublicEnvironment } =
      await import("./lib/supabase/public-environment");
    getSupabasePublicEnvironment();
  }
}
