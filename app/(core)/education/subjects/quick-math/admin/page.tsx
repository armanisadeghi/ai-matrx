import type { Metadata } from "next";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { MathProblemAdmin } from "@/features/math/components/MathProblemAdmin";
import { getCurrentUserAdminStatus } from "@/utils/auth/adminUtils";

export const metadata: Metadata = {
  title: "Quick Math Authoring · AI Matrx Education",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function QuickMathAdminPage() {
  const status = await getCurrentUserAdminStatus();
  if (status?.level !== "super_admin") {
    return (
      <div className="mx-auto max-w-md px-6 py-24 text-center">
        <ShieldAlert className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
        <h1 className="text-lg font-semibold">Super admin required</h1>
        <p className="mt-2 text-sm text-muted-foreground">Quick Math authoring is restricted to super admins.</p>
        <Link href="/education/subjects/quick-math" className="mt-6 inline-block text-sm text-primary hover:underline">Back to Quick Math lessons</Link>
      </div>
    );
  }
  return <MathProblemAdmin />;
}
