"use client";

/**
 * AppletRef — the ONE way an Applet is named inside the admin shell.
 *
 * THE DOOR LAW (common-docs/policies/no-dead-ends.md): every admin console that
 * prints an app's name owes the user the record, not just the string. This is a
 * thin composition over `EntityRef` (route + new tab + peek, resolved from the
 * registries) with two applet specifics baked in once instead of five times:
 *
 *   - `href` is overridden to the ADMIN editor. The registry route for the
 *     `app` token is `/applets/manage/<id>` (the owner-side shell); an operator
 *     working in `/administration/applets/*` wants the admin record.
 *   - the running Applet (`/applets/<slug>`) is offered as an EXTRA door, never as
 *     the record. The public page is what visitors see, not the app row —
 *     handing it over as "the app" is the dead end this component removes.
 *
 * Safe inside clickable rows: every control stops propagation.
 */

import React from "react";
import { Globe } from "lucide-react";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";

/** Admin editor for one app — the admin shell's canonical door. */
export function appletAdminEditHref(appId: string): string {
  return `/administration/applets/edit/${appId}`;
}

/** Executions & errors console, scoped to one app (the "runs" count door). */
export function appletExecutionsHref(appId: string): string {
  return `/administration/applets/executions?app=${appId}`;
}

/** Public renderer for a published app. An extra door, never the record. */
export function appletPublicHref(slug: string): string {
  return `/applets/${encodeURIComponent(slug)}`;
}

const CONTROL_CLASS =
  "flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground " +
  "transition-colors hover:bg-accent hover:text-foreground";

export interface AppletRefProps {
  /** `app.definition.id`. */
  appId: string;
  /** Display name; falls back to a truncated id when the join didn't resolve. */
  name?: string | null;
  /** Public slug — adds the `/applets/<slug>` door when present. */
  slug?: string | null;
  /** Controls stay visible instead of appearing on hover/focus. */
  alwaysShowActions?: boolean;
  className?: string;
}

export function AppletRef({
  appId,
  name,
  slug,
  alwaysShowActions,
  className,
}: AppletRefProps) {
  return (
    <EntityRef
      token="app"
      id={appId}
      name={name}
      href={appletAdminEditHref(appId)}
      className={className}
      alwaysShowActions={alwaysShowActions}
      extraActions={
        slug ? (
          <a
            href={appletPublicHref(slug)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            title={`Open /applets/${slug}`}
            aria-label={`Open /applets/${slug}`}
            className={CONTROL_CLASS}
          >
            <Globe className="h-3 w-3" />
          </a>
        ) : undefined
      }
    />
  );
}
