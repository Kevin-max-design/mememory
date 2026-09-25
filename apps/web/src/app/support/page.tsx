import { PublicShell } from "@/components/public-shell";

const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL;

export default function SupportPage() {
  return (
    <PublicShell>
      <main className="mx-auto max-w-3xl px-6 py-16 sm:py-20">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-teal-700">
          Support
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-950">
          How can we help?
        </h1>
        <p className="mt-5 text-lg leading-8 text-slate-600">
          For account, privacy, deletion, or product issues, contact the beta
          support team. Never send medical documents, passwords, or access
          tokens in a support message.
        </p>
        <section className="mt-10 rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-semibold">Contact</h2>
          {supportEmail ? (
            <a
              className="mt-3 inline-block font-semibold text-teal-800 underline"
              href={`mailto:${supportEmail}`}
            >
              {supportEmail}
            </a>
          ) : (
            <p className="mt-3 text-amber-900">
              The public support address has not been configured. Invited beta
              users should use the contact method in their invitation. This must
              be configured before public launch.
            </p>
          )}
          <p className="mt-4 text-sm text-slate-500">
            Include a short description and the approximate time of the problem.
            Do not include medical content.
          </p>
        </section>
        <section className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-6">
          <h2 className="font-semibold text-red-950">Medical emergency?</h2>
          <p className="mt-2 text-red-900">
            MedMemory cannot provide urgent help. Contact your local emergency
            services or a qualified healthcare professional.
          </p>
        </section>
      </main>
    </PublicShell>
  );
}
