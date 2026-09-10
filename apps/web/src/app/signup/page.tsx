import { AuthForm } from "@/components/auth-form";
import { signup } from "@/features/auth/actions";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return <AuthForm action={signup} error={error} mode="signup" />;
}
