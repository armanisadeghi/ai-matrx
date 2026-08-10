"use client";

/**
 * OrgWorkspaceWriteTargets — the live handlers for the write half of
 * `matrx-user/organizations` (the targets its manifest declares).
 *
 * Renders nothing. Mount once inside the workspace-mode
 * `SurfaceRuntimeProvider` in `OrgWorkspace`, with the loaded organization.
 * The `/organizations` launcher deliberately does NOT mount it: no org is
 * open there, so there is nothing to write.
 *
 * Every handler goes through `updateOrganization` — the SAME service the
 * Settings › General form's Save button calls — never a bespoke callback and
 * never a direct supabase write. That service reports failure by RETURNING
 * `{ success: false, error }` rather than throwing, and the org row it returns
 * is the server's, so each handler checks both: a soft failure becomes a
 * throw, and a value that did not land on the returned row becomes a throw.
 * The writeback runtime turns those throws into the loud toast + captured
 * error the agent reads back.
 *
 * Permission is re-checked here, not just in the confirm dialog: an agent must
 * not do through the seam what the page would not let the person do by hand.
 */

import { useEffect, useRef } from "react";

import { useSurfaceWriteHandlers } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { ORGANIZATIONS_SURFACE_NAME } from "@/features/surfaces/manifests/organizations.manifest";
import { useDispatchThunk } from "@/lib/redux/hooks";
import { invalidateAndRefetchFullContext } from "@/features/agent-context/redux/hierarchyThunks";
import { ensureScopeTree } from "@/features/scopes/redux/thunks/ensureScopeTree";
import { updateOrganization } from "../service";
import {
  validateOrganizationAbbreviation,
  validateOrgName,
  type Organization,
} from "../types";

/**
 * The replace-vs-append vocabulary for `org_description`. Declared once so the
 * handler's validation and the manifest's contract prose cannot drift.
 */
export const ORG_TEXT_WRITE_MODES = ["replace", "append"] as const;
export type OrgTextWriteMode = (typeof ORG_TEXT_WRITE_MODES)[number];

/** Longest description the Settings › General textarea accepts. */
const DESCRIPTION_MAX_LENGTH = 500;

/** Wire value for the `org_description` target. */
export interface OrgDescriptionWrite {
  text: string;
  mode?: OrgTextWriteMode;
}

interface OrgWorkspaceWriteTargetsProps {
  organization: Organization | null;
  /** True when the viewer is an owner or admin — the `can_manage` read twin. */
  canManage: boolean;
  /** Called with the server row after a successful write, so the workspace
   *  (and every read twin it emits) reflects what actually persisted. */
  onOrganizationUpdated: (organization: Organization) => void;
}

function asString(value: unknown, target: string): string {
  if (typeof value !== "string") {
    throw new Error(`${target} expects a plain string.`);
  }
  return value.trim();
}

export function OrgWorkspaceWriteTargets({
  organization,
  canManage,
  onOrganizationUpdated,
}: OrgWorkspaceWriteTargetsProps) {
  const dispatchThunk = useDispatchThunk();

  // Handlers are registered once for the component's life and read the LATEST
  // org through this ref — never the row captured at mount.
  const orgRef = useRef(organization);
  const canManageRef = useRef(canManage);
  useEffect(() => {
    orgRef.current = organization;
    canManageRef.current = canManage;
  });

  /**
   * The one gate every target passes through. Throws the refusal the agent
   * reads; returns the org it is allowed to write.
   */
  function requireWritableOrg(target: string): Organization {
    const org = orgRef.current;
    if (!org) {
      throw new Error(
        `${target}: no organization is open on this page — open an organization first.`,
      );
    }
    if (!canManageRef.current) {
      throw new Error(
        `${target}: only an owner or admin of "${org.name}" can change its settings. The current viewer cannot.`,
      );
    }
    return org;
  }

  /**
   * Persist through the canonical service and prove the value landed.
   * `updateOrganization` swallows errors into `{ success: false }`, so a
   * handler that ignored the result would report success for a write the
   * server rejected.
   */
  async function persist(
    target: string,
    orgId: string,
    updates: Parameters<typeof updateOrganization>[1],
    expect: (organization: Organization) => boolean,
  ): Promise<void> {
    const result = await updateOrganization(orgId, updates);
    if (!result.success || !result.organization) {
      throw new Error(
        result.error ?? `${target}: the organization could not be updated.`,
      );
    }
    if (!expect(result.organization)) {
      throw new Error(
        `${target}: the server accepted the request but the organization came back unchanged — the value did not land.`,
      );
    }
    onOrganizationUpdated(result.organization);
    try {
      await dispatchThunk(invalidateAndRefetchFullContext());
      await dispatchThunk(ensureScopeTree({ refresh: true }));
    } catch {
      // Hierarchy refresh is best-effort — the same allowance GeneralSettings
      // makes. The org row above is already the server's.
    }
  }

  useSurfaceWriteHandlers(ORGANIZATIONS_SURFACE_NAME, {
    org_name: async (value: unknown) => {
      const org = requireWritableOrg("org_name");
      const name = asString(value, "org_name");
      const validation = validateOrgName(name);
      if (!validation.valid) {
        throw new Error(`org_name: ${validation.error}`);
      }
      await persist("org_name", org.id, { name }, (row) => row.name === name);
    },

    org_description: async (value: unknown) => {
      const org = requireWritableOrg("org_description");
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        throw new Error(
          "org_description expects an object { text: string, mode?: replace | append }.",
        );
      }
      const { text, mode } = value as Record<string, unknown>;
      if (typeof text !== "string" || text.trim().length === 0) {
        throw new Error(
          "org_description: text must be a non-empty string. Clearing the description is a human action.",
        );
      }
      if (
        mode !== undefined &&
        !ORG_TEXT_WRITE_MODES.includes(mode as OrgTextWriteMode)
      ) {
        throw new Error(
          `org_description: mode must be one of ${ORG_TEXT_WRITE_MODES.join(" | ")}.`,
        );
      }
      const current = org.description ?? "";
      const next =
        mode === "append" && current.trim().length > 0
          ? `${current.trimEnd()}\n\n${text.trim()}`
          : text.trim();
      if (next.length > DESCRIPTION_MAX_LENGTH) {
        throw new Error(
          `org_description: the result is ${next.length} characters — the description holds at most ${DESCRIPTION_MAX_LENGTH}.`,
        );
      }
      await persist(
        "org_description",
        org.id,
        { description: next },
        (row) => (row.description ?? "") === next,
      );
    },

    org_abbreviation: async (value: unknown) => {
      const org = requireWritableOrg("org_abbreviation");
      if (org.isPersonal) {
        throw new Error(
          "org_abbreviation: personal workspaces always use ME — this one cannot be renamed.",
        );
      }
      const abbreviation = asString(value, "org_abbreviation");
      const validation = validateOrganizationAbbreviation(abbreviation);
      if (!validation.valid) {
        throw new Error(`org_abbreviation: ${validation.error}`);
      }
      await persist(
        "org_abbreviation",
        org.id,
        { abbreviation },
        (row) => row.abbreviation === abbreviation,
      );
    },

    org_website: async (value: unknown) => {
      const org = requireWritableOrg("org_website");
      const website = asString(value, "org_website");
      let parsed: URL;
      try {
        parsed = new URL(website);
      } catch {
        throw new Error(
          "org_website: must be an absolute URL beginning with http:// or https://.",
        );
      }
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error(
          `org_website: ${parsed.protocol}// is not a web address — use http:// or https://.`,
        );
      }
      await persist(
        "org_website",
        org.id,
        { website },
        (row) => (row.website ?? "") === website,
      );
    },
  });

  return null;
}
