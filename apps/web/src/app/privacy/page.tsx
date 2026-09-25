import { LegalPage } from "@/components/legal-page";

export default function PrivacyPage() {
  return (
    <LegalPage eyebrow="Legal" title="Privacy Policy">
      <p>
        This policy explains how the MedMemory beta handles information when you
        use the service.
      </p>
      <h2>Information we handle</h2>
      <p>
        We process account information such as your name and email, medical
        documents you choose to upload, information extracted from those
        documents, review decisions, and limited security and operational
        records. Medical records can contain sensitive personal information.
      </p>
      <h2>How we use information</h2>
      <p>
        We use your information to provide your private archive, process
        documents, show source-linked results, support search and question
        answering, protect the service, diagnose failures, and meet legal
        obligations. We do not use your medical documents for advertising.
      </p>
      <h2>AI-assisted processing</h2>
      <p>
        Uploaded records may be processed by automated text recognition and
        extraction systems. Results can be incomplete or wrong and remain
        subject to your review. MedMemory is not a medical provider and does not
        make medical decisions.
      </p>
      <h2>Storage and service providers</h2>
      <p>
        MedMemory relies on hosting, authentication, database, storage, and
        processing providers to operate the service. Access is limited to what
        is needed to provide and secure the product. Contact support with
        questions about the providers used for your account.
      </p>
      <h2>Retention, export, and deletion</h2>
      <p>
        Your account includes tools to export reviewed records, delete
        documents, and request account deletion. Some security and audit records
        may be retained where necessary to protect the service or satisfy legal
        obligations. Backups can take time to age out under the applicable
        backup schedule.
      </p>
      <h2>Security</h2>
      <p>
        We use access controls, private object storage, encrypted transport,
        server-side authorization, rate limiting, and audit records. No system
        can guarantee absolute security. Do not upload records if you do not
        accept the risks of an early beta.
      </p>
      <h2>Your choices</h2>
      <p>
        You decide which documents to add and which extracted facts to approve,
        correct, or reject. You can export reviewed data and delete documents or
        your account from the product.
      </p>
      <h2>Children</h2>
      <p>
        The beta is intended for adults who can agree to these terms. Do not
        create an account for a child unless the service expressly supports your
        legal authority to do so.
      </p>
      <h2>Contact</h2>
      <p>
        Use the contact method on the Support page for privacy questions,
        account requests, or concerns about how information is handled.
      </p>
    </LegalPage>
  );
}
