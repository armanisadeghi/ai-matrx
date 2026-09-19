"use client";

/**
 * features/sharing/components/RecordStoreShareSurface.tsx
 *
 * THE APP'S ONE SHARE DIALOG, HANDED TO `@ai-matrx/records-ui`.
 *
 * `@ai-matrx/records-ui` draws a Share button on the record and table screens
 * and asks its host for a dialog (`share` on `<RecordsUiProvider>`). It ships
 * none of its own, on purpose: AI Matrx has exactly one sharing surface, and a
 * second one inside the package would give the platform two answers to "who can
 * see this" — the one question a platform may not answer twice.
 *
 * This is the whole binding. It is thirty lines because the dialog already
 * exists and already works for any registered resource type: `record` is one
 * (`platform.shareable_resource_registry` → `custom.record`), so the people
 * picker, the four levels, the grant list with inline level-edit and revoke,
 * and the "who can see this and why" panel are all the canonical ones.
 *
 * A TABLE IS A RECORD. In the unified store a Table is a `custom.record` row
 * whose table is the Table kernel, so both screens pass `resourceType="record"`
 * and only the NOUN differs — which is why `kind` is used for the dialog's
 * title and nothing else.
 *
 * WHERE THE WRITES GO. The dialog's RPCs (`share_resource_with_user`,
 * `revoke_resource_access`, `update_permission_level`, …) hand every write on a
 * schema-`custom` resource to the record store's own door (`custom.share_grant`
 * / `custom.share_revoke`) — see
 * migrations/campaign/share_one_ladder_reaches_the_share_dialog.sql. So the
 * store's product switch, its external-principal rule and its
 * both-organizations wall all apply, and there is still exactly one write path.
 */

import type { ShareSubject } from "@ai-matrx/records-ui";

import { ShareModal } from "./ShareModal";

/**
 * Bind as `host={{ share: recordStoreShare }}` on `<RecordsMount>`.
 *
 * `organizationId` rides along on the subject and is deliberately NOT passed
 * down: the store resolves a record's organization off the row itself, so a
 * caller can never name one it is not in.
 */
export function recordStoreShare(subject: ShareSubject) {
  return (
    <ShareModal
      isOpen
      onClose={subject.onClose}
      resourceType="record"
      resourceId={subject.subjectId}
      resourceName={subject.name}
    />
  );
}
