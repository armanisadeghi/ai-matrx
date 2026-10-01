"use client";

/**
 * ShellOrgSwitcher — THE organization control of the app chrome (owner,
 * 2026-09-30: "the ONLY CANONICAL org selector for the sidebar and header").
 *
 * The active organization is always on screen: its own icon, or its
 * abbreviation, in the sidebar's account rail directly above the person
 * (`variant="rail"`), and the same control in the phone's navigation drawer
 * (`variant="drawer"`) and the canvas workspace's nav (`variant="inline"`).
 * It replaced three copies: the header's "Choose organization" chip, the
 * avatar menu's Organization group, and the canvas nav's hand-built drop-up.
 *
 * What it reads and writes is unchanged — `useActiveOrganizationPicker` (the
 * active org from `appContextSlice`, hydrated before first paint by the sync
 * engine's `appContextPolicy` and mirrored to the shared apex cookie by
 * `activeOrgCookieMiddleware`; memberships from the scope tree) and the one
 * sanctioned switch, `chooseActiveOrganization`. The list is the canonical
 * `OrganizationPickerPanel` (search, your own first, "Keep it at the top").
 *
 * Every organization state shows HERE:
 *   - none chosen (boot answered with none) → a primary ring and "Choose organization";
 *   - the page's object lives in another of the person's organizations → a
 *     primary dot, and the picker opens with a one-click switch to it
 *     (the offer the header chip used to make — `pageObjectOrganization.ts`).
 */

import { useState } from "react";
import { ArrowRightLeft, Building2 } from "lucide-react";
import { SelectChevron } from "@ai-matrx/design-system";
import { cn } from "@/lib/utils";
import { useAppDispatch } from "@/lib/redux/hooks";
import { chooseActiveOrganization } from "@/lib/redux/thunks/activeOrgBootstrap";
import { useActiveOrganizationPicker } from "@/features/organizations/hooks/useActiveOrganizationPicker";
import { OrganizationPickerPopover } from "@/features/organizations/components/OrganizationPickerPopover";
import { OrganizationMark } from "@/features/organizations/components/OrganizationMark";
import { usePageObjectOrganization } from "@/features/shell/pageObjectOrganization";

type Variant = "rail" | "drawer" | "inline";

export function ShellOrgSwitcher({ variant = "rail" }: { variant?: Variant }) {
  const dispatch = useAppDispatch();
  const [open, setOpen] = useState(false);
  const { activeOrgId, activeOrgName, organizations, promptForOrg } = useActiveOrganizationPicker();
  const objectOrganization = usePageObjectOrganization();

  const active = organizations.find((org) => org.id === activeOrgId) ?? null;
  const name = active?.name ?? activeOrgName ?? null;
  // An object page names its own organization: nothing there waits on a choice.
  const asking = promptForOrg && !activeOrgId && objectOrganization === null;

  const offer =
    objectOrganization &&
    !objectOrganization.shownByPage &&
    objectOrganization.name &&
    objectOrganization.member === true &&
    objectOrganization.organizationId !== activeOrgId
      ? { id: objectOrganization.organizationId, name: objectOrganization.name }
      : null;

  const label = name ?? (asking ? "Choose organization" : "Organization");
  const description = offer
    ? `Organization: ${name ?? "none"}. This page lives in ${offer.name}`
    : name
      ? `Organization: ${name}. Change organization`
      : "Choose an organization";

  const mark = (
    <span className="relative flex shrink-0 items-center justify-center">
      {name ? (
        <OrganizationMark
          name={name}
          abbreviation={active?.abbreviation}
          logoUrl={active?.logo_url}
          size={variant === "inline" ? 20 : 24}
        />
      ) : (
        <span
          className={cn(
            "flex shrink-0 items-center justify-center rounded-md",
            variant === "inline" ? "h-5 w-5" : "h-6 w-6",
            asking ? "bg-primary/10 text-primary ring-2 ring-primary" : "bg-muted text-muted-foreground",
          )}
          aria-hidden="true"
        >
          <Building2 className="h-3.5 w-3.5" strokeWidth={2} />
        </span>
      )}
      {offer ? (
        <span
          className="pointer-events-none absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-primary ring-2 ring-background"
          data-org-offer-dot
          aria-hidden="true"
        />
      ) : null}
    </span>
  );

  const header = offer ? (
    <button
      type="button"
      onClick={() => {
        dispatch(chooseActiveOrganization({ id: offer.id, name: offer.name }));
        setOpen(false);
      }}
      data-page-object-organization={offer.id}
      className="mb-1 flex w-full items-center gap-2 rounded-md bg-primary/10 px-2.5 py-2 text-left text-sm text-primary hover:bg-primary/15"
    >
      <ArrowRightLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate">Switch to {offer.name}</span>
    </button>
  ) : undefined;

  const trigger =
    variant === "rail" ? (
      <button
        type="button"
        aria-label={description}
        title={label}
        data-shell-org-switcher="rail"
        className="shell-nav-item shell-nav-stable shell-tactile-subtle"
      >
        <span className="shell-nav-icon">{mark}</span>
        <span className={cn("shell-nav-label", asking && "text-primary")}>{label}</span>
      </button>
    ) : variant === "drawer" ? (
      <button
        type="button"
        aria-label={description}
        data-shell-org-switcher="drawer"
        className="shell-mobile-nav-item w-full"
      >
        <span className="shell-nav-icon">{mark}</span>
        <span className={cn("min-w-0 flex-1 truncate text-left", asking && "text-primary")}>{label}</span>
        <SelectChevron size="sm" />
      </button>
    ) : (
      <button
        type="button"
        aria-label={description}
        title={label}
        data-shell-org-switcher="inline"
        className={cn(
          "flex h-9 max-w-[45%] shrink-0 items-center gap-1.5 rounded-lg px-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground",
          open && "bg-accent text-foreground",
        )}
      >
        {mark}
        <span className={cn("min-w-0 truncate", asking && "text-primary")}>{label}</span>
        <SelectChevron size="sm" />
      </button>
    );

  return (
    <OrganizationPickerPopover
      open={open}
      onOpenChange={setOpen}
      side={variant === "rail" ? "right" : "top"}
      align="end"
      header={header}
      trigger={trigger}
    />
  );
}
