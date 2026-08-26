// app/(core)/hr/page.tsx — Route 1, the role-adaptive HR home.
//
// 🚨 THIS SURFACE IS OWNED BY SPEC-DOMAIN-WIDE §1 (ruling R4), NOT BY THIS LANE.
// The home composes every pillar and belongs to none, so the card grid
// (`HrHomeGrid`), its per-persona composition, the queue-card rules and the
// composition config key are all that spec's to build.
//
// TODO(L9 / SPEC-DOMAIN-WIDE §1): replace `<HrHomeStarters>` below with
// `HrHomeGrid`. Everything above it — the shell, the four universal states, the
// activation door and the first-hire door — is this lane's (L1) and stays.
//
// What this lane DID build here, because the home is unreachable without it:
//   • the four universal states, in order, via `<HrPageState>`;
//   • the module-off enable door and the activation door (an org with no
//     `hr.employer_profile` has no other legitimate first screen — §2.1);
//   • the first-hire door, because an activated employer with nobody in it has
//     exactly one useful next action;
//   • an interim list of the doors THIS person actually has, so the home is never
//     a blank page and never a dead end. It carries no counts, no queues and no
//     cards — those are L9's, and a placeholder that guessed at them would be a
//     second home to delete later.

"use client";

import Link from "next/link";
import { UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { hrPeopleNewHref } from "@/features/hr/routes";
import { resolveHrNav } from "@/features/hr/shared/hr-nav";
import { HrPageState } from "@/features/hr/shared/HrStates";
import { HrShell } from "@/features/hr/shared/HrShell";
import { useHrContext } from "@/features/hr/shared/useHrContext";
import { useHrPersona } from "@/features/hr/shared/useHrPersona";

export default function HrHomePage() {
  return (
    <HrShell>
      <HrPageState variant="cards" rows={4} operation="Your HR home">
        <HrHomeStarters />
      </HrPageState>
    </HrShell>
  );
}

function HrHomeStarters() {
  const { active, orgRef } = useHrContext();
  const { persona, employmentId, can, all } = useHrPersona();

  const nav = resolveHrNav({
    persona,
    capabilities: all,
    employmentId,
    org: orgRef,
  });
  // The home is not a door to itself.
  const doors = nav.items.filter((item) => item.key !== "home");

  const emptyEmployer = (active?.employee_count ?? 0) === 0;

  return (
    <div className="w-full min-w-0 space-y-6 p-4 sm:p-6">
      {emptyEmployer && can("identity.write") ? (
        <section className="space-y-2 rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-semibold text-foreground">
            Nobody is in HR here yet
          </h2>
          <p className="text-sm text-muted-foreground">
            Adding one person turns on the directory, the org chart and every
            self-service surface. You can link somebody who already has a login,
            or an existing contact, instead of retyping them.
          </p>
          <Button asChild size="sm" className="min-h-11 sm:min-h-9">
            <Link href={hrPeopleNewHref({ org: orgRef })}>
              <UserPlus className="mr-2 h-4 w-4" />
              Add the first person
            </Link>
          </Button>
        </section>
      ) : null}

      {doors.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Where to start</h2>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {doors.map((door) => (
              <li key={door.key}>
                <Link
                  href={door.href}
                  className="flex min-h-[3.5rem] w-full items-start gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:bg-accent"
                >
                  <door.icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {door.label}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {door.description}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
