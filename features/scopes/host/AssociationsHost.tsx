// features/scopes/host/AssociationsHost.tsx
//
// THE React half of the `@ai-matrx/associations` host binding: one
// `AssociationsProvider` mount carrying the UI ports this app — and only this
// app — can supply, wrapped around the whole authed tree from
// app/Providers.tsx (inside StoreProvider, so the identity port's
// store-singleton reads always find Redux hydrated).
//
// C22 CENSUS — every line below injects APP IDENTITY. Nothing here catches,
// retries, validates or reinterprets anything the package returns:
//
//   notifier        → @/lib/toast — the ONE toast entry point in this app.
//   windowShell     → WindowPanel, this app's WINDOW MANAGER (tray docking,
//                     workspace persistence, shared z-order). The package
//                     ships a real draggable window of its own; only the
//                     manager integration is ours.
//   capture         → the canonical imperative openers: upload guard, cloud
//                     file picker, data-tables createDocument. Three app
//                     services, passed through.
//   pickerOverrides → token "file" → the ONE canonical FilePickerWindow.
//   entityDoors     → EntityRef / EntityDoorControls / the access-gate
//                     UnresolvedEntityRef (resolved per row via useAccessStates).
//   authorDisplay   → current-user comment-author enrichment from the
//                     canonical Redux identity selectors.
//
// Code-splitting is the PACKAGE's job since @ai-matrx/associations 0.6.0: the
// two WindowPanel-parsing bindings go through `lazyWindowShell` /
// `lazyPickerOverride`, which replaced the `next/dynamic({ ssr: false })` glue
// this file used to hand-write. The doors are light shells (EntityRef's peek
// machinery is already behind its own lazy front door) and stay static.
//
// D311 — MOUNTING IS INERT, AND THE CLASS IS CLOSED IN THE PACKAGE.
//
// `AssociationsProvider` used to run the package's `assertDemandedSchema` on
// mount, which asked whether each of the 26 demanded RPCs existed by CALLING
// it with sentinel args — fourteen of them WRITES. Measured here on
// `/administration/billing/spend`: 25 POSTs to `/rest/v1/rpc/<name>` answered
// 400 on EVERY page load, ahead of the page's own reads, in production too
// (the package's "dev only" gate was `process.env.NODE_ENV`, which its own
// esbuild build baked to `true`). This host turned it off first; the probe and
// its `probeSchema` knob are DELETED from @ai-matrx/associations 0.9.0, so
// every consumer inherits the fix and there is nothing left to switch on here.
//
// A wrong database still announces itself: PGRST202 at any real call site
// raises `demanded_schema_violation` with a remedy through the bound errorSink.

"use client";

import type { ReactNode } from "react";
import {
  AssociationsProvider,
  lazyPickerOverride,
  lazyWindowShell,
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
  windowShell: {
    Window: lazyWindowShell(() =>
      import("./associationsHostPortsImpl").then(
        (m) => m.AssociationsWindowShellImpl,
      ),
    ),
  },
  capture: {
    requestUpload: async (opts) => {
      // Narrowing the port's open `visibility` string to THIS app's closed
      // union — an app-vocabulary translation, not error massaging.
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
  pickerOverrides: {
    file: lazyPickerOverride(() =>
      import("./associationsHostPortsImpl").then(
        (m) => m.FileAssociationPickerImpl,
      ),
    ),
  },
  entityDoors: {
    EntityRef,
    DoorControls: EntityDoorControls,
    UnresolvedRef: UnresolvedRefDoor,
  },
};

export function AssociationsHost({ children }: { children: ReactNode }) {
  // The `authorDisplay` port: enrich the SIGNED-IN user's own comments from
  // the canonical Redux identity (the same `selectActiveUser*` selectors
  // every header/user-display surface reads — fresher than the RPC's
  // denormalized author fields after a rename or avatar change). Other
  // authors keep `cmt_list`'s denormalized fields; there is no user-directory
  // primitive in this repo to resolve them synchronously (see
  // components/official/record-stamps/useRecordActors.ts), and the package's
  // documented degradation already renders them honestly.
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
