// Study-guide authoring — SUPER ADMIN only.
//
// This route lives in the (core) app shell (not an admin-gated layout), so it
// gates itself server-side. Defence in depth: the server actions re-check
// super-admin and the SECURITY DEFINER RPCs gate again at the DB. Not indexable.

import type { Metadata } from "next";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { getCurrentUserAdminStatus } from "@/utils/auth/adminUtils";
import { listLearnDocsAdminAction } from "@/features/education/publishing/actions";
import { LearnDocAdmin } from "@/features/education/publishing/components/LearnDocAdmin";
import { eduHref } from "@/features/education/constants";

export const metadata: Metadata = {
  title: "Study Guide Authoring · AI Matrx Education",
  robots: { index: false, follow: false },
};

// Always render fresh for the current admin's session.
export const dynamic = "force-dynamic";

export default async function LearnAdminPage() {
  const status = await getCurrentUserAdminStatus();
  if (status?.level !== "super_admin") {
    return (
      <div className="mx-auto max-w-md px-6 py-24 text-center">
        <ShieldAlert className="mx-auto h-10 w-10 text-muted-foreground mb-4" />
        <h1 className="text-lg font-semibold">Super admin required</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Study-guide authoring is restricted to super admins.
        </p>
        <Link
          href={eduHref("learn")}
          className="mt-6 inline-block text-sm text-primary hover:underline"
        >
          Back to study guides
        </Link>
      </div>
    );
  }

  const docs = await listLearnDocsAdminAction();
  return <LearnDocAdmin initialDocs={docs} />;
}
