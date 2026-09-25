import { LegalPage } from "@/components/legal-page";

export default function TermsPage() {
  return (
    <LegalPage eyebrow="Legal" title="Terms of Use">
      <p>
        These terms govern access to the MedMemory beta. By creating an account,
        you agree to use the service responsibly and acknowledge its limits.
      </p>
      <h2>What MedMemory provides</h2>
      <p>
        MedMemory helps you organize medical documents, review extracted
        information, search reviewed history, and create source-linked summaries
        and answers. Beta features may change, fail, or be withdrawn.
      </p>
      <h2>Not medical advice</h2>
      <p>
        MedMemory does not provide diagnosis, treatment, clinical monitoring, or
        emergency services. Automated output can be incomplete or wrong. Verify
        important details against the original record and consult a qualified
        clinician before making a medical decision. For an emergency, contact
        local emergency services.
      </p>
      <h2>Your responsibilities</h2>
      <p>
        You must provide accurate account information, protect your credentials,
        upload only records you are authorized to use, review extracted
        information, and avoid unlawful or abusive activity. You may not attempt
        to access another person&apos;s account or disrupt the service.
      </p>
      <h2>Your content</h2>
      <p>
        You retain your rights in documents and information you upload. You
        grant the service the limited permission needed to store, process,
        display, export, and delete that content at your direction.
      </p>
      <h2>Privacy</h2>
      <p>
        The Privacy Policy explains how information is handled. Medical records
        are sensitive; use the beta only after reviewing those practices and
        understanding the stated limitations.
      </p>
      <h2>Availability and changes</h2>
      <p>
        The beta is provided on an as-available basis. We may restrict or
        suspend access to protect users, maintain security, comply with law, or
        discontinue the beta. Material terms changes should be communicated
        before they take effect.
      </p>
      <h2>Account termination</h2>
      <p>
        You can delete your account through the product. We may suspend accounts
        used unlawfully, abusively, or in ways that threaten the service or
        other users.
      </p>
      <h2>Contact and governing terms</h2>
      <p>
        Use the Support page for questions about these terms or your account.
      </p>
    </LegalPage>
  );
}
