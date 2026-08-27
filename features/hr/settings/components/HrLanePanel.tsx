// features/hr/settings/components/HrLanePanel.tsx
//
// THE SHELL CONTRACT FOR ROUTES 74–81b — the panels whose CONTENTS belong to another
// lane (Leave, Time, Scheduling, Access, Workflow, Notifications, AI, Retention,
// Onboarding).
//
// What this lane ships for each of them, and what it deliberately does not:
//
//   ✅ THE ROUTE. Real, deep-linkable, in the tab bar. A missing tab means an admin
//      cannot discover the setting exists at all, which is worse than a page that
//      says who is building it.
//   ✅ THE UNIFORM D13 SHAPE. Every key that lane has already registered in
//      `platform.feature_knob` is live and editable HERE, through the same
//      `<KnobPanel>` every other settings panel uses. This is the part people assume
//      is missing and is not: an admin can change the leave and time knobs today.
//   ✅ AN HONEST STATEMENT of what the panel will grow into, naming the owning lane.
//   ❌ THE LANE'S OWN EDITORS. A leave-policy editor built here would be a second
//      implementation the Leave lane then has to delete.
//
// 🚨 AN UNLAWFUL CONFIGURATION IS BLOCKED AT THE CONTROL, WITH ITS CITATION —
// never as a save-time error. `<KnobRow>` renders a `floor` as a locked control with
// the citation visible, and a panel supplies floors through its presentation map. A
// save-time rejection teaches an admin nothing and reads as a bug in the product.

"use client";

import Link from "next/link";
import { Info } from "lucide-react";

import { useHrContext } from "../../shared/useHrContext";
import type { HrSettingsSection } from "../../routes";
import { HrSettingsShell } from "../HrSettingsShell";
import { selectHrKnobs, useHrKnobs } from "../hooks/useHrKnobs";
import { HR_SETTINGS_OWNER_LABEL, hrSettingsTab } from "../settings-tabs";
import type { HrKnobPresentationMap } from "../types";
import { KnobPanel } from "./KnobPanel";

export function HrLanePanel({
  section,
  /** Which `platform.feature_knob` features this panel owns, e.g. `["hr.leave"]`. */
  features,
  /** Extra keys by bare name, for a key registered under another feature. */
  keys,
  /** Key prefixes this panel owns, for a feature split across two panels. */
  prefixes,
  /** Key prefixes a SIBLING panel owns — kept off this one so neither drifts. */
  excludePrefixes,
  presentation,
  /** What the finished panel will do, in the admin's words. */
  promise,
  /** Anything this lane ships beyond the knobs — route 78's flow-type list, say. */
  children,
  title,
  description,
}: {
  section: HrSettingsSection;
  features?: string[];
  keys?: string[];
  prefixes?: string[];
  excludePrefixes?: string[];
  presentation?: HrKnobPresentationMap;
  promise: string;
  children?: React.ReactNode;
  title?: string;
  description?: string;
}) {
  const { active } = useHrContext();
  const organizationId = active?.organization_id ?? null;
  const tab = hrSettingsTab(section);

  const { knobs, isLoading, error, refresh } = useHrKnobs({
    organizationId,
    presentation,
  });

  const mine = selectHrKnobs(knobs, { features, keys, prefixes, excludePrefixes });

  return (
    <HrSettingsShell
      section={section}
      title={title ?? tab?.label ?? "Settings"}
      description={description ?? tab?.purpose}
      loading={isLoading}
      error={error}
      operation={`The ${tab?.label ?? "settings"} panel`}
      onRetry={refresh}
    >
      <div className="space-y-6 p-4 sm:p-6">
        {children}

        {organizationId ? (
          <KnobPanel
            title="Settings this employer can change"
            description="The platform default, whether this employer overrides it, and the control. Clearing an override removes the key — it never stores an empty value."
            knobs={mine}
            organizationId={organizationId}
            onChanged={refresh}
            emptyLabel="This area has not registered any configuration keys yet. When it does, they appear here on their own — this panel reads the registry rather than listing keys by hand."
          />
        ) : null}

        <section className="flex items-start gap-3 rounded-lg border border-dashed border-border p-4">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
          <div className="min-w-0 space-y-1">
            <h2 className="text-sm font-semibold text-foreground">
              What this panel becomes
            </h2>
            <p className="text-sm text-muted-foreground">{promise}</p>
            <p className="text-sm text-muted-foreground">
              It is being built by {HR_SETTINGS_OWNER_LABEL[tab?.owner ?? "l1"]}. The
              settings above are live now and take effect immediately.
            </p>
          </div>
        </section>
      </div>
    </HrSettingsShell>
  );
}

/**
 * A door out of a lane panel to something that DOES exist — so a panel waiting on
 * another lane is still never a dead end.
 */
export function HrLaneDoor({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-11 items-center rounded-md border border-border px-3 text-sm text-foreground hover:bg-accent sm:min-h-9"
    >
      {label}
    </Link>
  );
}
