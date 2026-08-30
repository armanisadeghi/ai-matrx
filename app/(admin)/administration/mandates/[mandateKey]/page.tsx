import { AdminMandateWorkspacePage } from "@/features/mandates/admin/AdminMandateWorkspacePage";

/**
 * /administration/mandates/[mandateKey] — the admin door onto THE
 * mandate workspace. Same component as /agents/mandates/[mandateKey]; the only
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
  const { mandateKey } = await params;
  return <AdminMandateWorkspacePage mandateKey={decodeURIComponent(mandateKey)} />;
}
