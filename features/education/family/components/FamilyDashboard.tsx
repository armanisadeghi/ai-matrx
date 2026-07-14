"use client";

// features/education/family/components/FamilyDashboard.tsx
//
// The Parent / Guardian hub at /education/family — a list-first "savior" view
// (VISION §14 + "Coming Soon: Parent and guardian dashboard"). It serves both
// sides of the consented relationship on one page:
//   • GUARDIAN — the roster of students who granted access (click → read-only
//     progress), plus "request access to a student" (pending until they approve)
//     and the requests I've sent.
//   • STUDENT — a consent inbox (approve/decline guardian requests) and a direct
//     "let a parent see my progress" grant.
// Access is ALWAYS student-consented: a guardian request confers nothing until
// approved; every read is re-checked server-side by the guardian_* RPCs.
//
// React Compiler is on: no manual useMemo / useCallback / React.memo.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Users,
  UserPlus,
  ShieldCheck,
  Inbox,
  Clock,
  ChevronRight,
  X,
  Check,
  Loader2,
  GraduationCap,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { familyService } from "../familyService";
import { useGuardianStudents } from "../useGuardianStudents";
import type { GuardianLinkView } from "../types";

function displayName(link: GuardianLinkView): string {
  return link.counterpart_name?.trim() || link.counterpart_email || "Learner";
}

export function FamilyDashboard() {
  const router = useRouter();
  const { buckets, loading, error, reload } = useGuardianStudents();
  const [navigating, startNav] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [studentEmail, setStudentEmail] = useState("");
  const [guardianEmail, setGuardianEmail] = useState("");

  const openStudent = (studentId: string) =>
    startNav(() => router.push(`/education/family/${studentId}`));

  const run = async (key: string, fn: () => Promise<string | null>) => {
    setBusy(key);
    const err = await fn();
    setBusy(null);
    if (err) {
      toast.error(err);
    } else {
      reload();
    }
  };

  const requestStudent = () =>
    run("request", async () => {
      const email = studentEmail.trim();
      if (!email) return "Enter the student's email";
      const res = await familyService.requestStudent(email);
      if (res.error) return res.error;
      setStudentEmail("");
      toast.success("Request sent — the student must approve before you can view their progress.");
      return null;
    });

  const grantGuardian = () =>
    run("grant", async () => {
      const email = guardianEmail.trim();
      if (!email) return "Enter your parent or guardian's email";
      const res = await familyService.grantGuardian(email, "guardian");
      if (res.error) return res.error;
      setGuardianEmail("");
      toast.success("Access granted — they can now see your study progress.");
      return null;
    });

  const respond = (link: GuardianLinkView, approve: boolean) =>
    run(`respond-${link.id}`, async () => {
      const res = await familyService.respond(link.counterpart_user_id, approve);
      if (res.error) return res.error;
      toast.success(approve ? "Guardian approved." : "Request declined.");
      return null;
    });

  const removeLink = (link: GuardianLinkView) =>
    run(`remove-${link.id}`, async () => {
      const res = await familyService.unlink(
        link.guardian_user_id,
        link.student_user_id,
      );
      if (res.error) return res.error;
      toast.success("Removed.");
      return null;
    });

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col gap-5 overflow-y-auto p-4">
      <header>
        <h1 className="flex items-center gap-2 text-xl font-bold text-foreground">
          <Users className="h-5 w-5 text-primary" /> Family
        </h1>
        <p className="text-sm text-muted-foreground">
          Follow a learner&apos;s progress — study time, mastery, and learning
          gain. Read-only and private: you only ever see a student who has
          granted you access.
        </p>
      </header>

      {error && (
        <div className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          Couldn&apos;t load your family links: {error}
        </div>
      )}

      {/* Consent inbox — pending guardian requests awaiting MY approval */}
      {buckets.inbox.length > 0 && (
        <Section
          icon={Inbox}
          title="Approve access"
          subtitle="These people asked to follow your progress. Approve only if you know them."
        >
          <ul className="flex flex-col gap-2">
            {buckets.inbox.map((link) => (
              <li
                key={link.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {displayName(link)}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    wants to see your study progress
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Button
                    size="sm"
                    className="h-8 gap-1"
                    disabled={busy === `respond-${link.id}`}
                    onClick={() => respond(link, true)}
                  >
                    {busy === `respond-${link.id}` ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Check className="h-3.5 w-3.5" />
                    )}
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 gap-1 text-muted-foreground"
                    disabled={busy === `respond-${link.id}`}
                    onClick={() => respond(link, false)}
                  >
                    <X className="h-3.5 w-3.5" />
                    Decline
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Guardian roster — students who granted me access */}
      <Section
        icon={GraduationCap}
        title="Students you follow"
        subtitle="Tap a student to see their study progress."
      >
        {loading ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-14 rounded-lg" />
            <Skeleton className="h-14 rounded-lg" />
          </div>
        ) : buckets.students.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-background px-3 py-6 text-center text-sm text-muted-foreground">
            No students yet. Ask a student to add you below, or request access to
            their account.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {buckets.students.map((link) => (
              <li key={link.id}>
                <div
                  className={cn(
                    "group flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-2.5 transition-colors hover:border-primary/40",
                    navigating && "opacity-60",
                  )}
                >
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    disabled={navigating}
                    onClick={() => openStudent(link.counterpart_user_id)}
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold uppercase text-primary">
                      {displayName(link).charAt(0)}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {displayName(link)}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {link.relationship ? `${link.relationship} · ` : ""}
                        {link.counterpart_email}
                      </span>
                    </span>
                  </button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 px-2 text-xs text-muted-foreground"
                    disabled={busy === `remove-${link.id}`}
                    onClick={() => removeLink(link)}
                  >
                    Remove
                  </Button>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Request access to a student */}
      <Section
        icon={UserPlus}
        title="Request access to a student"
        subtitle="Enter the student's account email. They'll be asked to approve before you can see anything."
      >
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            void requestStudent();
          }}
        >
          <Input
            type="email"
            inputMode="email"
            placeholder="student@example.com"
            value={studentEmail}
            onChange={(e) => setStudentEmail(e.target.value)}
            className="text-base sm:text-sm"
          />
          <Button
            type="submit"
            className="shrink-0 gap-1.5"
            disabled={busy === "request"}
          >
            {busy === "request" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <UserPlus className="h-4 w-4" />
            )}
            Send request
          </Button>
        </form>
        {buckets.sent.length > 0 && (
          <ul className="mt-3 flex flex-col gap-1.5">
            {buckets.sent.map((link) => (
              <li
                key={link.id}
                className="flex items-center justify-between gap-3 text-xs text-muted-foreground"
              >
                <span className="flex items-center gap-1.5 truncate">
                  <Clock className="h-3.5 w-3.5 shrink-0" />
                  Awaiting approval from {link.counterpart_email}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  disabled={busy === `remove-${link.id}`}
                  onClick={() => removeLink(link)}
                >
                  Cancel
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Student side — grant a parent/guardian directly */}
      <Section
        icon={ShieldCheck}
        title="Let a parent see your progress"
        subtitle="Are you the student? Add a parent or guardian's email to share your study progress with them. You can remove access anytime."
      >
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            void grantGuardian();
          }}
        >
          <Input
            type="email"
            inputMode="email"
            placeholder="parent@example.com"
            value={guardianEmail}
            onChange={(e) => setGuardianEmail(e.target.value)}
            className="text-base sm:text-sm"
          />
          <Button
            type="submit"
            variant="outline"
            className="shrink-0 gap-1.5"
            disabled={busy === "grant"}
          >
            {busy === "grant" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ShieldCheck className="h-4 w-4" />
            )}
            Grant access
          </Button>
        </form>
      </Section>
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: typeof Users;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Icon className="h-4 w-4 text-primary" />
          {title}
        </h2>
        {subtitle && (
          <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
        )}
      </div>
      {children}
    </section>
  );
}
