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
 *
 * 🚨 **`?org=` IS AN ANSWER, AND THIS CONTROL MUST NOT RE-ASK IT.**
 * Arriving at `/hr/time/punches?org=<employer>` used to read *"This register has no scope yet.
 * Choose a person, or an employer"* above a list of every employer — telling somebody to choose an
 * employer they had already named in the URL. The employer and the SUBJECT are two different
 * questions: `?org=` settles which employer, `?employment=` / `?scope=org` settle whose punches.
 * Once `?org=` is present only the second question is open, and only the second is asked.
 *
 * The employer in the URL is never overridden here, and `scope=org` is never assumed from it: an
 * employer-wide register is a large, separately-gated read, so it stays something a person asks
 * for. What changed is that asking for it no longer means re-picking the employer.
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
    // hr-url-exempt: `query` starts as a COPY of the current search params, so `org`
    // survives untouched — this rebuild preserves the employer rather than dropping it.
    // A builder call here would have to re-list every filter this picker does not own.
    // See `features/hr/__tests__/no-hand-built-hr-urls.test.ts`.
    // hr-url-exempt: the query-copy rationale is documented immediately above.
    router.push(`/hr/time/punches?${query.toString()}`);
    setOpen(false);
  }

  /*
   * The employer `?org=` resolved to. `useHrContext` applies SPEC-UI-IA §1 rule 1, so when the URL
   * carries an employer this IS that employer — which is exactly why this control may state it
   * rather than ask for it.
   */
  const activeEmployer = employers.find((e) => e.organization_id === active?.organization_id);
  const orderedEmployers = activeEmployer
    ? [activeEmployer, ...employers.filter((e) => e !== activeEmployer)]
    : employers;

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
          ) : activeEmployer ? (
            /*
             * THE EMPLOYER IS ALREADY SETTLED — by `?org=` or by the context it resolved to — so
             * it is STATED, not asked for. Only the subject is still open.
             */
            <>
              This register is set to{" "}
              <span className="font-medium text-foreground">{activeEmployer.name}</span>. Choose
              whose punches to show.
            </>
          ) : (
            // No employer resolved at all: then it genuinely is both questions.
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
              {activeEmployer ? "Everyone here" : "Everyone at one employer"}
            </div>
            {employers.length === 0 ? (
              <p className="text-[12px] text-muted-foreground">
                No employer is available to you yet.
              </p>
            ) : (
              <ul className="space-y-1">
                {/*
                  🚨 THE EMPLOYER ALREADY IN THE URL COMES FIRST, AS THE PRIMARY ACTION.
                  It is not one option among several: `?org=` already named it, and re-listing it
                  level with the others is what made this control read as "you have not chosen an
                  employer" to somebody who had. The rest stay reachable — an employer-wide
                  register IS one of the doors this page opens — but below, and secondary.
                */}
                {orderedEmployers.map((employer) => {
                  const isActive =
                    employer.organization_id === activeEmployer?.organization_id;
                  return (
                    <li key={employer.organization_id}>
                      <Button
                        type="button"
                        size="sm"
                        variant={isActive ? "default" : "outline"}
                        className="w-full justify-start"
                        onClick={() => {
                          const query = new URLSearchParams(params?.toString() ?? "");
                          query.delete("employment");
                          // Rewriting `org` for the ACTIVE employer is a no-op that also
                          // normalises a uuid in the URL to the readable slug; for any other
                          // employer it is the deliberate full context change §1 requires.
                          query.set("org", employer.slug ?? employer.organization_id);
                          query.set("scope", "org");
                          // hr-url-exempt: the same copy-then-amend rebuild, and this branch explicitly
                          // RE-SETS `org` above for the employer being switched to (§1's full context change).
                          router.push(`/hr/time/punches?${query.toString()}`);
                          setOpen(false);
                        }}
                      >
                        {isActive ? `Everyone at ${employer.name}` : employer.name}
                      </Button>
                    </li>
                  );
                })}
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
