export type AuthErrorCode =
  | "auth_required"
  | "invalid_credentials"
  | "signup_failed"
  | "signup_session_unavailable"
  | "confirmation_failed"
  | "password_reset_failed"
  | "signout_failed"
  | "invalid_input";

const messages: Record<AuthErrorCode, string> = {
  auth_required: "Please sign in to continue.",
  invalid_credentials: "The email or password is incorrect.",
  signup_failed:
    "We could not create your account. If you may already have an account, use Forgot password from the sign-in page.",
  signup_session_unavailable:
    "We could not start your session. Please try again later.",
  confirmation_failed: "This confirmation link is invalid or has expired.",
  password_reset_failed:
    "We could not update the password. Request a new recovery link and try again.",
  signout_failed: "We could not complete sign out. Please try again.",
  invalid_input:
    "Check every field. Use a valid email and passwords of at least 12 matching characters where requested.",
};

export function authErrorMessage(code: string | undefined) {
  return code && code in messages ? messages[code as AuthErrorCode] : undefined;
}
