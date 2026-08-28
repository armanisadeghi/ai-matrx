"use client";

/**
 * features/hr/time/punches/PunchRegisterScopePicker.tsx — the control route 30 was asking with.
 *
 * 🚨 **THE PAGE ASKED A QUESTION AND OFFERED NO WAY TO ANSWER IT.**
 * `hr.punch_register` refuses an unscoped call by name, and its sentence is a good one:
 *
 *   > "Ask for a person or for an organization. The punch register never returns 'everything the
 *   > caller happens to be able to see' — an evidence lane has to state its scope."
 *
 * That refusal rendered on an otherwise empty page with no picker, no search and no employer list.
 * The only way to comply was to already know a UUID and type it into the query string by hand, or
 * to arrive from route 29's "Open this person's punches" link. A manager who navigated to the punch
 * register from the nav read an instruction they could not follow. An instruction with no control
 * is not an empty state, it is a dead end — and it made the register look broken rather than
 * unscoped.
 *
 * ♻️ **REUSE, NOT A SECOND SEARCH.** The person half is `EmployeeSearchSelect`, route 34's picker,
 * which already owns the search against lane L1's `fetchHrDirectory`. It is used with
 * `purpose="evidence"` so its punch-eligibility gates do not apply: those answer "may this person
 * clock in", and this page answers "what did this person's clock record". The employer half is the
 * `employers` list `HrProvider` already resolved — no new read is issued by this component.
 *
 * 🚨 **THE SCOPE LIVES IN THE URL**, so a scoped register is linkable, bookmarkable and shareable
 * with the person who has to act on it — the same property `hrPunchesHref` already relies on.
 */

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Building2, ChevronDown, UserRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useHrContext } from "@/features/hr/shared/useHrContext";

import { EmployeeSearchSelect } from "../clock/EmployeeSearchSelect";

export interface PunchRegisterScope {
  employmentId: string | null;
  /** True when the caller asked for the whole employer rather than one person. */
  orgScope: boolean;
}

/** Reads the scope this page is currently running at, from the URL alone. */
export function readPunchRegisterScope(params: {
  employment?: string | null;
  scope?: string | null;
}): PunchRegisterScope {
  return {
    employmentId: params.employment?.trim() || null,
    orgScope: params.scope === "org",
  };
}

export function PunchRegisterScopePicker({
  scope,
  subjectName,
}: {
  scope: PunchRegisterScope;
  /** The name of the person currently scoped to, when the register knows it. */
  subjectName?: string | null;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const { employers, active } = useHrContext();
  const chosen = scope.employmentId !== null || scope.orgScope;
  const [open, setOpen] = useState(!chosen);

  function go(next: { employment?: string | null; scope?: string | null }) {
    const query = new URLSearchParams(params?.toString() ?? "");
    // 🚨 The two scopes are EXCLUSIVE. Leaving a stale `employment` behind while switching to the
    // employer would send the server both filters and quietly answer a narrower question than the
    // one the manager just asked for.
    query.delete("employment");
    query.delete("scope");
    if (next.employment) query.set("employment", next.employment);
    if (next.scope) query.set("scope", next.scope);
    router.push(`/hr/time/punches?${query.toString()}`);
    setOpen(false);
  }

  const activeEmployer = employers.find((e) => e.organization_id === active?.organization_id);

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
        <p className="text-[12px] text-muted-foreground">
          {scope.employmentId ? (
            <>
              Showing the punches of{" "}
              <span className="font-medium text-foreground">
                {subjectName ?? "one person"}
              </span>
              .
            </>
          ) : scope.orgScope ? (
            <>
              Showing every punch at{" "}
              <span className="font-medium text-foreground">
                {activeEmployer?.name ?? "this employer"}
              </span>
              .
            </>
          ) : (
            // The server's instruction, answered by the control directly below it.
            <>This register has no scope yet. Choose a person, or an employer.</>
          )}
        </p>
        <Button
          type="button"
          size="sm"
          variant={chosen ? "outline" : "default"}
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          <ChevronDown
            className={`mr-1.5 h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
            aria-hidden
          />
          {chosen ? "Change who this is about" : "Choose who this is about"}
        </Button>
      </div>

      {open ? (
        <div className="grid gap-4 border-t border-border px-3 py-3 sm:grid-cols-2">
          <div>
            <div className="mb-2 flex items-center gap-1.5 text-[12px] font-medium text-foreground">
              <UserRound className="h-3.5 w-3.5" aria-hidden />
              One person
            </div>
            {active?.organization_id ? (
              <EmployeeSearchSelect
                organizationId={active.organization_id}
                purpose="evidence"
                label="Whose punches do you want to see?"
                onSelect={(subject) => go({ employment: subject.employmentId })}
              />
            ) : (
              <p className="text-[12px] text-muted-foreground">
                Choose an employer first — people are searched within one employer, never across
                them.
              </p>
            )}
          </div>

          <div>
            <div className="mb-2 flex items-center gap-1.5 text-[12px] font-medium text-foreground">
              <Building2 className="h-3.5 w-3.5" aria-hidden />
              Everyone at one employer
            </div>
            {employers.length === 0 ? (
              <p className="text-[12px] text-muted-foreground">
                No employer is available to you yet.
              </p>
            ) : (
              <ul className="space-y-1">
                {employers.map((employer) => (
                  <li key={employer.organization_id}>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="w-full justify-start"
                      onClick={() => {
                        const query = new URLSearchParams(params?.toString() ?? "");
                        query.delete("employment");
                        query.set("org", employer.slug ?? employer.organization_id);
                        query.set("scope", "org");
                        router.push(`/hr/time/punches?${query.toString()}`);
                        setOpen(false);
                      }}
                    >
                      {employer.name}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            {/*
              🚨 An employer-wide register is a large read and the server gates it on
              `working_record.read` over the whole organization. It is offered because the door
              offers it — `give_one_of: [filters.employment_ids, filters.organization_id]` — and a
              refusal here is rendered as the server's own sentence like any other.
            */}
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
              An employer-wide register only opens for someone whose reach covers the whole
              employer. If yours does not, the register will say so in its own words.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
