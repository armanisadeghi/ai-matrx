"use client";

import { Pencil } from "lucide-react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsSuperAdmin } from "@/lib/redux/slices/userSlice";
import { crossDeploymentHref } from "@/lib/deployment/surfaces";
import { RequestAccess } from "@/features/access-gate/components/RequestAccess";
import { adminMandateHref } from "../browse/url-compat";
import type { MandateWorkspaceData } from "./useMandateWorkspaceData";

// features/mandates/workspace/DefinitionEditDoor.tsx
//
// The definition-section edit affordance OUTSIDE the admin route. A mandate's
// goal / provision / output is a SYSTEM definition: the server gates every
// edit to super admins (aidream PATCH /mandates/{key}/goal, /draft-inputs), so
//   · a super admin gets a working pencil — to the admin route, where it edits;
//   · everyone else gets no pencil at all (owner ruling, 2026-09-25: "Remove it
//     if they can't use it") and one way to ask the platform team instead.

export function DefinitionEditDoor({
  data,
  section,
}: {
  data: Pick<MandateWorkspaceData, "mandate">;
  section: "Goal" | "Provision" | "Output";
}) {
  const isSuperAdmin = useAppSelector(selectIsSuperAdmin);
  const key = data.mandate.mandate_key;
  const action = `Edit ${section.toLowerCase()}`;

  if (isSuperAdmin) {
    const href = adminMandateHref(key);
    return (
      <a
        href={crossDeploymentHref(href) ?? href}
        aria-label={`${action} in Administration`}
        title={`${action} in Administration`}
        className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Pencil className="size-3" aria-hidden="true" />
      </a>
    );
  }

  return (
    <RequestAccess
      variant="icon"
      target={{
        action,
        resource: {
          kind: "Mandate",
          name: data.mandate.label?.trim() || key,
          type: "mandate",
          id: data.mandate.id,
        },
        owner: "system",
      }}
    />
  );
}
