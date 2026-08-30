// features/scopes/host/AssociationsHost.tsx
//
// THE React half of the `@ai-matrx/associations` host binding (W5 swap): one
// `AssociationsProvider` mount carrying the five UI ports, wrapped around the
// whole authed tree from app/Providers.tsx (inside StoreProvider, so the
// identity port's store-singleton reads always find Redux hydrated — the same
// coverage the deleted Redux cache fragments had).
//
//   notifier        → @/lib/toast (the ONE toast entry point)
//   windowShell     → WindowPanel, behind a lazy edge (bundle invariant:
//                     WindowPanel must never be parsed in a route/boot bundle)
//   capture         → the canonical imperative openers: upload guard, cloud
//                     file picker, data-tables createDocument
//   pickerOverrides → token "file" → the ONE canonical FilePickerWindow (lazy)
//   entityDoors     → EntityRef / EntityDoorControls / the access-gate
//                     UnresolvedEntityRef (resolved per row via useAccessStates)
//   authorDisplay   → current-user comment-author enrichment from the
//                     canonical Redux identity selectors (0.5.0 comments UI)
//
// Code-splitting: the two WindowPanel-parsing bindings live in
// associationsHostPortsImpl.tsx behind `dynamic({ ssr: false })` edges — they
// fetch only when an association window / file picker first renders. The
// doors are light shells (EntityRef's peek machinery is already behind its
// own lazy front door) and stay static.
//
// Dev diagnostic: in development the demanded-schema probe
// (`assertDemandedSchema`) runs once after mount and screams into the
// errorSink on any missing RPC — never in production, never on a hot path.

"use client";

import { useEffect, type ReactNode } from "react";
import dynamic from "next/dynamic";
import {
  AssociationsProvider,
  type AssociationsUiPorts,
} from "@ai-matrx/associations/react";
import type { AuthorDisplayPort } from "@ai-matrx/associations";
import { toast } from "@/lib/toast";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectActiveUserAvatarUrl,
  selectActiveUserId,
  selectActiveUserName,
} from "@/lib/redux/selectors/userSelectors";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { EntityDoorControls } from "@/components/official/entity-ref/EntityDoorControls";
import { UnresolvedEntityRef } from "@/features/access-gate/components/UnresolvedEntityRef";
import { useAccessStates } from "@/features/access-gate/hooks/useAccessStates";
import { requestUpload } from "@/features/files/upload/uploadGuardOpeners";
import { openFilePicker } from "@/features/files/components/pickers/cloudFilesPickerOpeners";
import { createDocument } from "@/features/data-tables/document-service";
import type { Visibility } from "@/features/files/types";
import { getAssociationsStore } from "./associationsStore";
import { associationsErrorSink } from "./errorSink";

// ── the two WindowPanel-parsing bindings (one impl chunk, lazy) ────────────
const AssociationsWindowShell = dynamic(
  () =>
    import("./associationsHostPortsImpl").then(
      (m) => m.AssociationsWindowShellImpl,
    ),
  { ssr: false, loading: () => null },
);
const FileAssociationPicker = dynamic(
  () =>
    import("./associationsHostPortsImpl").then(
      (m) => m.FileAssociationPickerImpl,
    ),
  { ssr: false, loading: () => null },
);

const VISIBILITIES: readonly Visibility[] = [
  "personal",
  "internal",
  "link",
  "public",
];

/** Per-row unresolved door: resolve WHY through the access gate, render honestly. */
function UnresolvedRefDoor({ token, id }: { token: string; id: string }) {
  const access = useAccessStates(token, [id]);
  return (
    <UnresolvedEntityRef
      id={id}
      context={access.states.get(id) ?? null}
      onChanged={access.refresh}
    />
  );
}

const UI_PORTS: AssociationsUiPorts = {
  notifier: {
    success: (msg) => toast.success(msg),
    error: (msg, opts) => toast.error(msg, opts),
  },
  windowShell: { Window: AssociationsWindowShell },
  capture: {
    requestUpload: async (opts) => {
      const visibility = VISIBILITIES.find((v) => v === opts.visibility);
      return requestUpload({
        files: opts.files,
        folderPath: opts.folderPath,
        ...(visibility ? { visibility } : {}),
      });
    },
    openFilePicker: (opts) => openFilePicker(opts),
    createDataTable: async ({ name }) => {
      const result = await createDocument({ name });
      return result.success ? { id: result.data.id } : null;
    },
  },
  pickerOverrides: { file: FileAssociationPicker },
  entityDoors: {
    EntityRef,
    DoorControls: EntityDoorControls,
    UnresolvedRef: UnresolvedRefDoor,
  },
};

export function AssociationsHost({ children }: { children: ReactNode }) {
  // The `authorDisplay` port (0.5.0 comments UI): enrich the SIGNED-IN
  // user's own comments from the canonical Redux identity (the same
  // `selectActiveUser*` selectors every header/user-display surface reads —
  // fresher than the RPC's denormalized author fields after a rename or
  // avatar change). Other authors keep `cmt_list`'s denormalized fields;
  // there is no user-directory primitive in this repo to resolve them
  // synchronously (see components/official/record-stamps/useRecordActors.ts),
  // and the package's documented degradation already renders them honestly.
  const currentUserId = useAppSelector(selectActiveUserId);
  const currentUserName = useAppSelector(selectActiveUserName);
  const currentUserAvatarUrl = useAppSelector(selectActiveUserAvatarUrl);
  const authorDisplay: AuthorDisplayPort = (author) => {
    if (!author.userId || author.userId !== currentUserId) return null;
    return {
      displayName: currentUserName ?? author.displayName,
      avatarUrl: currentUserAvatarUrl ?? author.avatarUrl,
    };
  };

  // Dev/CI boot diagnostic only — the demanded-schema probe (README § probed).
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    let stale = false;
    void Promise.all([
      import("@ai-matrx/associations/core"),
      import("./associationsStore"),
    ]).then(async ([{ assertDemandedSchema }, { associationsDataSource }]) => {
      {
        try {
          if (stale) return;
          await assertDemandedSchema(associationsDataSource);
        } catch (error) {
          associationsErrorSink({
            code: "demanded_schema_violation",
            message:
              error instanceof Error
                ? error.message
                : "assertDemandedSchema failed",
          });
        }
      }
    });
    return () => {
      stale = true;
    };
  }, []);

  return (
    <AssociationsProvider
      store={getAssociationsStore()}
      {...UI_PORTS}
      authorDisplay={authorDisplay}
    >
      {children}
    </AssociationsProvider>
  );
}
