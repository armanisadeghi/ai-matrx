// /education/family/[studentId] — a linked student's read-only progress.
//
// SERVER-GATED: this Server Component resolves the caller's guardian links via
// the SECURITY DEFINER `guardian_list_links` RPC and only renders when an ACTIVE
// guardian link to `studentId` exists. No active link (never granted, revoked,
// or not signed in) → notFound(). The client read RPCs re-check on every call,
// so the gate here is defence-in-depth + it supplies the student's display label.
// noindex — this is private family data.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { StudentProgressView } from "@/features/education/family/components/StudentProgressView";

export const metadata: Metadata = {
  title: "Student progress",
  robots: { index: false, follow: false },
};

export default async function GuardianStudentPage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const { studentId } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("guardian_list_links");
  if (error) notFound();

  const link = (data ?? []).find(
    (l) =>
      l.role === "guardian" &&
      l.status === "active" &&
      l.counterpart_user_id === studentId,
  );
  if (!link) notFound();

  const label =
    link.counterpart_name?.trim() || link.counterpart_email || "This student";

  return <StudentProgressView studentId={studentId} studentLabel={label} />;
}
