"use client";

// features/education/classes/components/ClassTestsSection.tsx
//
// The Tests row of a class hub, beside its units: each test with its date and
// the units it covers, opening the test page. The owner also adds, edits and
// removes tests; a member sees the list read-only.

import { useState } from "react";
import Link from "next/link";
import { CalendarClock, ClipboardCheck, MoreHorizontal, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { recordToast } from "@/lib/toast";
import type { ClassPart } from "../classParts";
import type { ClassTest } from "../classTests";
import type { UseClassTestsReturn } from "../hooks/useClassTests";
import { ClassTestDialog } from "./ClassTestDialog";

export function testHref(classParam: string, testId: string): string {
  return `/education/classes/${classParam}/tests/${testId}`;
}

export function ClassTestsSection({
  classParam,
  tests,
  units,
  unitNounPlural,
  canEdit,
}: {
  classParam: string;
  tests: UseClassTestsReturn;
  units: readonly ClassPart[];
  unitNounPlural: string;
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState<"new" | ClassTest | null>(null);
  if (!canEdit && tests.tests.length === 0) return null;
  const unitName = (id: string) => units.find((u) => u.id === id)?.name ?? null;

  async function remove(test: ClassTest) {
    const ok = await confirm({
      title: `Remove ${test.name}?`,
      description: `The ${unitNounPlural.toLowerCase()} and everything in them stay.`,
      confirmLabel: "Remove",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      await tests.removeTest(test.id);
    } catch (err) {
      recordToast.error(
        { type: "scope", id: test.id, title: test.name },
        `Could not remove ${test.name}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-foreground">
          {tests.nounPlural}
          {tests.tests.length > 0 && (
            <span className="ml-1.5 text-muted-foreground">({tests.tests.length})</span>
          )}
        </h2>
        {canEdit && (
          <Button icon={<Plus />} variant="outline" onClick={() => setEditing("new")}>
            {`New ${tests.nounSingular.toLowerCase()}`}
          </Button>
        )}
      </div>
      {tests.tests.length > 0 && (
        <ul className="space-y-1.5">
          {tests.tests.map((t) => (
            <li key={t.id} className="flex items-center gap-1 rounded-lg border border-border bg-card pr-1">
              <Link
                href={testHref(classParam, t.id)}
                className="flex min-w-0 flex-1 items-center gap-2.5 rounded-l-lg px-3 py-2 transition-colors hover:bg-accent"
              >
                <ClipboardCheck className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-foreground">{t.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {t.unitIds.map(unitName).filter(Boolean).join(", ")}
                  </span>
                </span>
                {t.date && (
                  <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                    <CalendarClock className="h-3.5 w-3.5" />
                    {t.date}
                  </span>
                )}
              </Link>
              {canEdit && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      icon={<MoreHorizontal />}
                      variant="quiet"
                      className="shrink-0"
                      aria-label={`${t.name} options`}
                    />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setEditing(t)}>Edit</DropdownMenuItem>
                    <DropdownMenuItem className="text-destructive" onSelect={() => void remove(t)}>
                      Remove
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </li>
          ))}
        </ul>
      )}
      {editing !== null && (
        <ClassTestDialog
          key={editing === "new" ? "new" : editing.id}
          open
          onOpenChange={(o) => !o && setEditing(null)}
          initial={editing === "new" ? undefined : editing}
          units={units}
          nounSingular={tests.nounSingular}
          unitNounPlural={unitNounPlural}
          onSubmit={async (value) => {
            if (editing === "new") await tests.createTest(value);
            else await tests.updateTest(editing.id, value);
          }}
        />
      )}
    </section>
  );
}
