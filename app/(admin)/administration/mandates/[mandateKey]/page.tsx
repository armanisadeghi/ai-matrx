import { AdminMandateWorkspacePage } from "@/features/mandates/admin/AdminMandateWorkspacePage";

/**
 * /administration/mandates/[mandateKey] — the admin door onto THE
 * mandate workspace. Same component as /mandates/[mandateKey]; the only
 * difference is the shell (admin chrome + the collapsed Admin controls). The
 * segment accepts the mandate KEY (dots are legal path characters) or the row
 * UUID. Auth + admin gating is the `(admin)` layout's job.
 */
export const metadata = {
  title: "Mandate",
  description: "One mandate — its job, its holder, and the admin controls",
};

export default async function AdminMandateRoute({
  params,
}: {
  params: Promise<{ mandateKey: string }>;
}) {
  // The App Router already decodes dynamic segment params — decoding again
  // double-decodes a literal `%` in the mandate key/id.
  const { mandateKey } = await params;
  return <AdminMandateWorkspacePage mandateKey={mandateKey} />;
}
