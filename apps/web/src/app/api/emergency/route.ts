import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { recordAuditEvent } from "@/features/audit/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const field = z.string().trim().max(2000).nullable();
const enabledField = z.enum([
  "full_name",
  "blood_group",
  "allergies_summary",
  "medications_summary",
  "conditions_summary",
  "emergency_contacts",
  "warnings",
]);
const schema = z
  .object({
    enabled: z.boolean(),
    disclosureConfirmed: z.boolean(),
    fullName: z.string().trim().max(200).nullable(),
    bloodGroup: z.string().trim().max(20).nullable(),
    allergiesSummary: field,
    medicationsSummary: field,
    conditionsSummary: field,
    warnings: field,
    contactName: z.string().trim().max(200).nullable(),
    contactPhone: z.string().trim().max(50).nullable(),
    enabledFields: z.array(enabledField).max(7),
  })
  .strict()
  .refine((value) => !value.enabled || value.disclosureConfirmed, {
    message: "Disclosure confirmation is required.",
  });

export async function PUT(request: Request) {
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user)
    return NextResponse.json(
      { error: "Authentication is required." },
      { status: 401 },
    );

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "The emergency summary fields are invalid." },
      { status: 400 },
    );

  const token = parsed.data.enabled
    ? randomBytes(32).toString("base64url")
    : null;
  const tokenHash = token
    ? createHash("sha256").update(token).digest("hex")
    : null;
  const contacts =
    parsed.data.contactName || parsed.data.contactPhone
      ? [
          {
            name: parsed.data.contactName,
            phone: parsed.data.contactPhone,
          },
        ]
      : [];
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("emergency_profiles")
    .upsert(
      {
        user_id: auth.user.id,
        enabled: parsed.data.enabled,
        full_name: parsed.data.fullName,
        blood_group: parsed.data.bloodGroup,
        allergies_summary: parsed.data.allergiesSummary,
        medications_summary: parsed.data.medicationsSummary,
        conditions_summary: parsed.data.conditionsSummary,
        warnings: parsed.data.warnings,
        emergency_contacts: contacts,
        enabled_fields: parsed.data.enabledFields,
        token_hash: tokenHash,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    )
    .select("id")
    .single();
  if (error)
    return NextResponse.json(
      { error: "The emergency summary could not be saved." },
      { status: 500 },
    );

  await recordAuditEvent({
    actorUserId: auth.user.id,
    action: parsed.data.enabled ? "share.created" : "admin.action",
    resourceType: "emergency_profile",
    resourceId: data.id,
    status: "succeeded",
    metadata: { source_route: "/api/emergency" },
  });
  return NextResponse.json(
    {
      ok: true,
      publicPath: token ? `/emergency-card/${token}` : null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
