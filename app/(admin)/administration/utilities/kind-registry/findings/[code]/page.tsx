/**
 * ONE Shape Doctor finding class, with what it takes to resolve it.
 *
 * WHY A ROUTE AND NOT A WINDOW PANEL (Arman offered either, 2026-08-26): the
 * resolution body is a working surface, not a peek — side-by-side skills plus a
 * Monaco diff need the width, and an admin mid-decision must be able to link a
 * class to someone, reload after a write, and come back to it. Building the
 * route first also produces THE canonical component; when this wants to be a
 * panel too, the panel wraps `FindingResolutionBody` and inherits every
 * capability, which is exactly what features/window-panels/FEATURE.md demands
 * (a panel WRAPS the canonical component, never a hand-rolled body).
 *
 * The per-code body is a dispatch, not a page per code: `duplicate-skill` is
 * the built exemplar and every other code renders the honest finding list with
 * its door to the affected kind, so the next code to earn a real resolver slots
 * in beside it.
 */

import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CircleAlert, TriangleAlert } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { gatherFindingCodePayload } from "@/features/content-ir/admin/shape-findings-server";
import {
  findingSpec,
  isBookkeeping,
} from "@/features/content-ir/admin/shape-finding-catalog";
import DuplicateSkillResolver from "@/features/content-ir/admin/DuplicateSkillResolver";
import type { FindingCode } from "@/features/content-ir/registry/shape-doctor";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await params;
  const spec = findingSpec(decodeURIComponent(code));
  return {
    title: spec ? `${spec.label} — Shape Doctor` : "Shape Doctor finding",
    description: spec?.what,
  };
}

function BodySkeleton() {
  return (
    <div className="space-y-3 p-4">
      <Skeleton className="h-8 w-80" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}

async function FindingBody({
  code,
  measuredOnBoard,
}: {
  code: FindingCode;
  measuredOnBoard: boolean;
}) {
  const payload = await gatherFindingCodePayload(code);

  if (code === "duplicate-skill") {
    return <DuplicateSkillResolver cases={payload.duplicateSkillCases} />;
  }

  if (payload.findings.length === 0) {
    return (
      <p className="px-4 py-6 text-sm text-muted-foreground">
        {measuredOnBoard
          ? "Nothing outstanding in this class right now."
          : // "Nothing outstanding" would flatly contradict the banner above
            // it, which says an empty list here is not evidence of anything.
            // An empty list for a class the board cannot observe means the
            // board never looked — say that, not "clean".
            "This board never looked. The class is raised only by the CLI, so this list is empty by construction and says nothing about whether the class is clean."}
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border">
      {payload.findings.map((f, index) => (
        <li
          key={`${f.kind ?? ""}-${index}`}
          className="flex items-start gap-2 px-4 py-2 text-sm"
        >
          {f.severity === "red" ? (
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
          ) : (
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          )}
          <div className="min-w-0">
            {f.kind && (
              <Link
                href={`/administration/utilities/kind-registry/${encodeURIComponent(f.kind)}`}
                className="mr-2 font-mono text-xs font-semibold text-foreground underline-offset-2 hover:text-primary hover:underline"
              >
                {f.kind}
              </Link>
            )}
            <span className="text-muted-foreground">{f.message}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

export default async function ShapeFindingCodePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code: raw } = await params;
  const spec = findingSpec(decodeURIComponent(raw));
  // An unknown code is a genuinely absent page, not an empty one.
  if (!spec) notFound();

  return (
    <div className="bg-textured">
      <header className="border-b border-border bg-card px-4 py-3">
        <Link
          href="/administration/utilities/kind-registry?tab=board"
          className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Shape System status board
        </Link>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-lg font-semibold text-foreground">
            {spec.label}
          </h1>
          <span className="font-mono text-xs text-muted-foreground">
            {spec.code}
          </span>
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
              spec.severity === "red"
                ? "bg-red-500/10 text-red-700 dark:text-red-300"
                : "bg-amber-500/10 text-amber-700 dark:text-amber-300"
            }`}
          >
            {spec.severity}
          </span>
        </div>
        <p className="mt-2 max-w-4xl text-sm text-muted-foreground">
          {spec.what}
        </p>
        <p className="mt-1 max-w-4xl text-sm text-foreground">{spec.how}</p>
        {isBookkeeping(spec) && spec.command && (
          <p className="mt-2 max-w-4xl rounded border border-violet-500/40 bg-violet-500/5 px-3 py-2 text-xs text-violet-800 dark:text-violet-200">
            This class is BOOKKEEPING — a generated file committed in the repo
            has gone stale, and no click in this browser can rewrite a file in
            the repo. The fix is{" "}
            <code className="rounded bg-muted px-1 font-mono">
              {spec.command}
            </code>{" "}
            followed by a commit.
          </p>
        )}
        {!spec.measuredOnBoard && (
          <p className="mt-2 max-w-4xl rounded border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            This class is raised only by the CLI — the live board reads bundled
            inputs and can never observe it. An empty list here is NOT evidence
            that the class is clean; run{" "}
            <code className="rounded bg-muted px-1 font-mono">
              {spec.command ?? "pnpm check:shapes"}
            </code>{" "}
            for the real answer.
          </p>
        )}
      </header>

      <Suspense fallback={<BodySkeleton />}>
        <FindingBody
          code={spec.code}
          measuredOnBoard={spec.measuredOnBoard}
        />
      </Suspense>
    </div>
  );
}
