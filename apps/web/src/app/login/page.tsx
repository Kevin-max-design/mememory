import { AuthForm } from "@/components/auth-form";
import { login } from "@/features/auth/actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { error, message } = await searchParams;
  return (
    <AuthForm action={login} error={error} message={message} mode="login" />
  );
}
