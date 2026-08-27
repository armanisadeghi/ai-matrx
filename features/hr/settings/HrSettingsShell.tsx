// features/hr/settings/HrSettingsShell.tsx
//
// THE CHROME AND THE GATE FOR `/hr/settings/*`, split so neither is done twice.
//
//  • `<HrSettingsChrome>` is mounted ONCE, by the section's `layout.tsx`. It owns the
//    route-tab bar and every state that is ABOVE the page: employer resolution, the
//    module-off door, the activation wizard, and the HR-admin gate. Because it lives
//    in the layout, moving between tabs does not remount it — the bar keeps its
//    pending state instead of flashing.
//
//  • `<HrSettingsShell>` is what a PANEL wraps itself in. It carries only that panel's
//    own load / failure / refusal, through `HrPageState`. It renders no tab bar,
//    because a per-page bar is a second bar that can disagree with the first.
//
// 🚨 WHY THE CHROME RUNS THE UNIVERSAL STATES BY HAND. `HrPageState`'s empty-org
// branch is `HrEmptyOrg`, whose door is `/hr/settings/employer` — a page inside this
// chrome. Left alone that is a loop: the door sends you to a page whose empty state
// is the same door. The chrome answers the activation question FIRST, mounting the
// real wizard. By the time a panel's own `HrPageState` runs, `needsHrActivation` is
// false and that branch is unreachable.
//
// 🚨 HR-ADMIN ONLY, CAPABILITY-DRIVEN. The test is `identity.write` OR org
// owner/admin — exactly what `hr_knob_index` and `hr_structure_list` enforce
// server-side. NEVER a persona string: a custom Access Level that grants
// `identity.write` and nothing else must reach settings without being called an
// "hr_admin" first (SPEC-UI-IA §2.2).

"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

import { HrSubShell, type HrRouteTab } from "../shared/HrSubShell";
import {
  HrEmployerPicker,
  HrError,
  HrLoading,
  HrModuleOff,
  HrNoAccess,
  HrPageState,
} from "../shared/HrStates";
import { isOrgSteward, useHrPersona } from "../shared/useHrPersona";
import { isHrModuleOff, useHrContext } from "../shared/useHrContext";
import {
  HR_SETTINGS_SECTIONS,
  hrSettingsHref,
  type HrSettingsSection,
} from "../routes";
import { HrActivationWizard } from "./activation/HrActivationWizard";
import { useHrActivationState } from "./activation/useHrActivationState";
import { HR_SETTINGS_TABS, hrSettingsTab } from "./settings-tabs";

/**
 * True when this person may configure HR for this employer.
 *
 * The org-steward half is not a shortcut: an owner/admin is the only person who can
 * exist here before anybody has been granted an HR capability, and locking them out
 * of settings would make a freshly activated employer unconfigurable.
 */
export function useCanConfigureHr(): { allowed: boolean; isLoading: boolean } {
  const { can, orgRole, isLoading } = useHrPersona();
  return { allowed: can("identity.write") || isOrgSteward(orgRole), isLoading };
}

/** Which section the current URL is. `null` is the hub (route 67). */
export function hrSettingsSectionFromPath(
  pathname: string,
): HrSettingsSection | null {
  const rest = pathname.replace(/^\/hr\/settings\/?/, "").split("/")[0];
  return (HR_SETTINGS_SECTIONS as readonly string[]).includes(rest)
    ? (rest as HrSettingsSection)
    : null;
}

function tabsFor(orgRef: string | null): HrRouteTab[] {
  return HR_SETTINGS_TABS.map((tab) => ({
    key: tab.section ?? "hub",
    label: tab.label,
    icon: tab.icon,
    href: hrSettingsHref(tab.section, { org: orgRef }),
  }));
}

// ── The layout-level chrome ─────────────────────────────────────────────────

export function HrSettingsChrome({ children }: { children: ReactNode }) {
  const context = useHrContext();
  const activation = useHrActivationState(context.active?.organization_id ?? null);
  const { allowed, isLoading: personaLoading } = useCanConfigureHr();
  const pathname = usePathname() ?? "/hr/settings";
  const tab = hrSettingsTab(hrSettingsSectionFromPath(pathname));

  const body = (() => {
    if (context.isLoading) return <HrLoading variant="panel" rows={6} />;

    if (context.error) {
      // A context-level refusal means no HR standing at all — the no-access state,
      // not an error state.
      if (context.error.kind === "denied") {
        return (
          <HrNoAccess sentence="How HR works here is set by whoever runs HR for this employer." />
        );
      }
      return (
        <HrError
          operation="Your HR employers"
          error={context.error}
          onRetry={context.refresh}
        />
      );
    }

    if (!context.active) return <HrEmployerPicker />;

    if (isHrModuleOff(context)) {
      return (
        <HrModuleOff
          organizationId={context.active.organization_id}
          canEnable={isOrgSteward(context.active.org_role)}
        />
      );
    }

    // ── The activation gate — the wizard IS the empty-org state here ────────
    if (activation.mode === "wizard" || activation.mode === "first_hire") {
      if (!activation.organizationId) return <HrLoading variant="panel" rows={6} />;
      return (
        <HrActivationWizard
          organizationId={activation.organizationId}
          onComplete={() => activation.refresh()}
        />
      );
    }

    // ── HR-admin only ───────────────────────────────────────────────────────
    if (!personaLoading && !allowed) {
      return (
        <HrNoAccess sentence="How HR works here is set by whoever runs HR for this employer." />
      );
    }

    return children;
  })();

  return (
    <HrSubShell
      tabs={tabsFor(context.orgRef)}
      title={tab?.label ?? "HR settings"}
      description={tab?.purpose}
    >
      {body}
    </HrSubShell>
  );
}

// ── The page-level wrapper ──────────────────────────────────────────────────

/**
 * Wrap one `/hr/settings/*` panel's body.
 *
 * `section`, `title` and `description` are accepted so a panel reads as a whole
 * surface at its call site; the chrome above already titled the shell from the route,
 * so they are documentation here rather than a second title that could disagree.
 */
export function HrSettingsShell({
  children,
  loading,
  error,
  granted,
  operation,
  onRetry,
}: {
  section: HrSettingsSection | null;
  children: ReactNode;
  title?: string;
  description?: string;
  actions?: ReactNode;
  /** The panel's own load / failure / refusal, handed straight to `HrPageState`. */
  loading?: boolean;
  error?: unknown;
  granted?: boolean;
  operation?: string;
  onRetry?: () => void;
}) {
  return (
    <HrPageState
      loading={loading}
      error={error}
      granted={granted}
      operation={operation ?? "This settings panel"}
      onRetry={onRetry}
      variant="panel"
    >
      {children}
    </HrPageState>
  );
}
