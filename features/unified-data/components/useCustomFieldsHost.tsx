"use client";
// features/unified-data/components/useCustomFieldsHost.tsx
//
// THE HOST WIRING FOR THE CUSTOM-FIELDS HALF OF A RECORD, ONCE (FTS-5d). Every page that mounts
// records-ui's custom fields (`CustomFieldsSection`, or `StandardRecordForm`'s `custom` prop) gets the
// same four host answers from here — never a per-page copy:
//   - the word this app uses for the record ("People & Companies", or the page's own "Contact");
//   - "Make your own table": the New table dialog, started in the RECORD's organization;
//   - the agent door, registered live only while the surface is not dormant (a sleeping board tile
//     keeps its door but out of the page's agent offer).
// The caller renders `dialog` once, anywhere under its tree.
import { useRef, useState, type ReactNode } from "react";
import type { CustomFieldsSectionProps } from "@ai-matrx/records-ui";
import { tryGetEntityInfo } from "@/features/scopes/registry/entityRegistry";
import { NewTableDialog } from "@/features/make/MakeMount";
import { useScopeTree } from "@/features/scopes/hooks/useScopeTree";
import { registerCustomFieldsDoor } from "@ai-matrx/chat/surfaces/runtime/custom-field-targets";
import { useSurfaceDormant } from "@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext";

export type CustomFieldsHostProps = Pick<
  CustomFieldsSectionProps,
  "entityLabel" | "onMakeOwnTable" | "agentDoor"
>;

export function useCustomFieldsHost({
  entityToken,
  organizationId,
  entityLabel,
}: {
  entityToken: string;
  /** The ROW's organization (never the active one). */
  organizationId: string | null;
  /** The word the page gives its records ("Contact"); defaults to the registry's plural label. */
  entityLabel?: string;
}): { custom: CustomFieldsHostProps; dialog: ReactNode } {
  const [makingTable, setMakingTable] = useState(false);
  const label = entityLabel ?? (tryGetEntityInfo(entityToken)?.labelPlural || undefined);
  const { organizations: myOrganizations } = useScopeTree();
  const dormant = useSurfaceDormant();
  const liveRef = useRef(!dormant);
  // Registration is consumed during the same render transition; an effect is one paint late and
  // briefly offers a dormant field door as live.
  // eslint-disable-next-line react-hooks/refs
  liveRef.current = !dormant;

  const custom: CustomFieldsHostProps = {
    ...(label ? { entityLabel: label } : {}),
    onMakeOwnTable: () => {
      // T1.2: her own table is made in the organization this record belongs to. Opening a record
      // never switches the active organization (active-organization plan, 2026-10-07): the dialog
      // is handed the record's organization instead.
      setMakingTable(true);
    },
    agentDoor: (door) => registerCustomFieldsDoor({ ...door, isLive: () => liveRef.current }),
  };
  const home = myOrganizations.find((org) => org.id === organizationId);
  const dialog = (
    <NewTableDialog
      what={makingTable ? "create" : null}
      onClose={() => setMakingTable(false)}
      organization={home ? { id: home.id, name: home.name } : null}
    />
  );
  return { custom, dialog };
}
