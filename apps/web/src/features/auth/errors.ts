export type AuthErrorCode =
  | "auth_required"
  | "invalid_credentials"
  | "signup_failed"
  | "signup_session_unavailable"
  | "confirmation_failed"
  | "signout_failed"
  | "invalid_input";

const messages: Record<AuthErrorCode, string> = {
  auth_required: "Please sign in to continue.",
  invalid_credentials: "The email or password is incorrect.",
  signup_failed: "We could not create your account. Please try again.",
  signup_session_unavailable:
    "We could not start your session. Please try again later.",
  confirmation_failed: "This confirmation link is invalid or has expired.",
  signout_failed: "We could not complete sign out. Please try again.",
  invalid_input:
    "Enter a valid email and a password with at least 12 characters.",
};

export function authErrorMessage(code: string | undefined) {
  return code && code in messages ? messages[code as AuthErrorCode] : undefined;
}
