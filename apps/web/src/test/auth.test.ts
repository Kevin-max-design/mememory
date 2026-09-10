import { describe, expect, it } from "vitest";
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
});
