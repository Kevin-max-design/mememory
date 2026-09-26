"use client";

import { useState } from "react";

type InitialProfile = {
  enabled: boolean;
  fullName: string;
  bloodGroup: string;
  allergiesSummary: string;
  medicationsSummary: string;
  conditionsSummary: string;
  warnings: string;
  contactName: string;
  contactPhone: string;
  enabledFields: string[];
};

const disclosures = [
  ["full_name", "Name"],
  ["blood_group", "Blood group"],
  ["allergies_summary", "Allergies"],
  ["conditions_summary", "Conditions"],
  ["medications_summary", "Medications"],
  ["emergency_contacts", "Emergency contact"],
  ["warnings", "Warnings"],
] as const;

export function EmergencyProfileEditor({
  initial,
}: {
  initial: InitialProfile;
}) {
  const [profile, setProfile] = useState(initial);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [publicPath, setPublicPath] = useState<string | null>(null);

  function update(key: keyof InitialProfile, value: string | boolean) {
    setProfile((current) => ({ ...current, [key]: value }));
  }

  function toggleField(field: string) {
    setProfile((current) => ({
      ...current,
      enabledFields: current.enabledFields.includes(field)
        ? current.enabledFields.filter((item) => item !== field)
        : [...current.enabledFields, field],
    }));
  }

  async function save() {
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/emergency", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        enabled: profile.enabled,
        disclosureConfirmed: confirmed,
        fullName: profile.fullName || null,
        bloodGroup: profile.bloodGroup || null,
        allergiesSummary: profile.allergiesSummary || null,
        medicationsSummary: profile.medicationsSummary || null,
        conditionsSummary: profile.conditionsSummary || null,
        warnings: profile.warnings || null,
        contactName: profile.contactName || null,
        contactPhone: profile.contactPhone || null,
        enabledFields: profile.enabledFields,
      }),
    }).catch(() => null);
    const result = (await response?.json().catch(() => ({}))) as {
      error?: string;
      publicPath?: string | null;
    };
    if (!response?.ok) {
      setMessage(result.error ?? "The emergency summary could not be saved.");
      setBusy(false);
      return;
    }
    setPublicPath(result.publicPath ?? null);
    setMessage(
      profile.enabled
        ? "Public emergency access is enabled. Saving again rotates the private link."
        : "Private emergency summary saved. Public access is off.",
    );
    setBusy(false);
  }

  return (
    <div className="mt-7 grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
      <aside className="space-y-5">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="font-bold">Emergency access</h2>
          <label className="mt-5 flex items-center justify-between gap-4 rounded-xl bg-slate-50 p-4 text-sm font-semibold">
            Public emergency summary
            <input
              checked={profile.enabled}
              className="h-5 w-5 accent-teal-700"
              onChange={(event) => update("enabled", event.target.checked)}
              type="checkbox"
            />
          </label>
          <p className="mt-3 text-xs leading-5 text-slate-500">
            When enabled, anyone with the private link can view only the fields
            selected below. The link is rotated every time you save.
          </p>
          {publicPath ? (
            <a
              className="mt-4 block break-all rounded-xl bg-teal-50 p-3 text-sm font-semibold text-teal-800"
              href={publicPath}
              rel="noreferrer"
              target="_blank"
            >
              Open newly generated emergency card ↗
            </a>
          ) : null}
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="font-bold">Disclosure settings</h2>
          <div className="mt-4 divide-y divide-slate-100">
            {disclosures.map(([field, label]) => (
              <label
                className="flex items-center justify-between gap-3 py-3 text-sm font-semibold"
                key={field}
              >
                {label}
                <input
                  checked={profile.enabledFields.includes(field)}
                  className="h-4 w-4 accent-teal-700"
                  onChange={() => toggleField(field)}
                  type="checkbox"
                />
              </label>
            ))}
          </div>
        </section>
      </aside>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <h2 className="text-sm font-bold uppercase tracking-widest text-slate-600">
          Emergency card summary
        </h2>
        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <Field
            label="Full name"
            value={profile.fullName}
            onChange={(value) => update("fullName", value)}
          />
          <Field
            label="Blood group"
            value={profile.bloodGroup}
            onChange={(value) => update("bloodGroup", value)}
          />
          <Field
            label="Emergency contact"
            value={profile.contactName}
            onChange={(value) => update("contactName", value)}
          />
          <Field
            label="Contact phone"
            value={profile.contactPhone}
            onChange={(value) => update("contactPhone", value)}
          />
        </div>
        <div className="mt-7 space-y-5">
          <Area
            label="Critical allergies"
            value={profile.allergiesSummary}
            onChange={(value) => update("allergiesSummary", value)}
          />
          <Area
            label="Chronic conditions"
            value={profile.conditionsSummary}
            onChange={(value) => update("conditionsSummary", value)}
          />
          <Area
            label="Critical medications"
            value={profile.medicationsSummary}
            onChange={(value) => update("medicationsSummary", value)}
          />
          <Area
            label="Warnings or special instructions"
            value={profile.warnings}
            onChange={(value) => update("warnings", value)}
          />
        </div>
        {profile.enabled ? (
          <label className="mt-6 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-950">
            <input
              checked={confirmed}
              className="mt-1 accent-red-700"
              onChange={(event) => setConfirmed(event.target.checked)}
              type="checkbox"
            />
            I understand that anyone with the generated link can view the
            selected emergency fields until I disable or rotate it.
          </label>
        ) : null}
        <button
          className="mt-6 rounded-xl bg-teal-700 px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
          disabled={busy || (profile.enabled && !confirmed)}
          onClick={() => void save()}
          type="button"
        >
          {busy ? "Saving…" : "Save emergency summary"}
        </button>
        {message ? (
          <p className="mt-4 text-sm text-slate-700" role="status">
            {message}
          </p>
        ) : null}
      </section>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
      {label}
      <input
        className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-normal normal-case tracking-normal text-slate-900"
        maxLength={200}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </label>
  );
}

function Area({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">
      {label}
      <textarea
        className="mt-2 min-h-20 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-normal normal-case tracking-normal text-slate-900"
        maxLength={2000}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </label>
  );
}
