import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { authErrorMessage } from "@/features/auth/errors";
import { credentialsSchema, signupSchema } from "@/features/auth/schemas";

describe("authentication input", () => {
  it("accepts valid credentials", () => {
    expect(
      credentialsSchema.safeParse({
        email: "patient@example.test",
        password: "correct horse battery",
      }).success,
    ).toBe(true);
  });
  it("rejects short passwords and invalid email addresses", () => {
    expect(
      credentialsSchema.safeParse({ email: "invalid", password: "short" })
        .success,
    ).toBe(false);
  });
  it("requires a bounded profile name", () => {
    expect(
      signupSchema.safeParse({
        email: "patient@example.test",
        password: "correct horse battery",
        fullName: "",
      }).success,
    ).toBe(false);
  });
  it("does not expose upstream authentication errors", () => {
    expect(authErrorMessage("unexpected-provider-detail")).toBeUndefined();
    expect(authErrorMessage("invalid_credentials")).toBe(
      "The email or password is incorrect.",
    );
  });
  it("keeps profile bootstrap bound to validated signup metadata", () => {
    const sql = readFileSync(
      resolve(
        process.cwd(),
        "../../supabase/migrations/202609100001_auth_profile_bootstrap.sql",
      ),
      "utf8",
    );
    expect(sql).toContain("new.raw_user_meta_data ->> 'full_name'");
    expect(sql).toContain("left(coalesce");
    expect(sql).toContain("200)");
    expect(sql).toContain("insert into public.profiles");
    expect(sql).toContain("on conflict (id) do nothing");
  });
});
