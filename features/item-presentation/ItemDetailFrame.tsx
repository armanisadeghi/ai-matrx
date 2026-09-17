"use client";

/**
 * The frame around every item-presentation detail body — in the window, the
 * docked panel and the page alike:
 *
 *   - It IS a surface (`matrx-user/item-detail`): agents bound to it get the
 *     dossier, not a bare uuid. The scope is read at menu-open / launch time
 *     from state the detail already holds — never fetched.
 *   - It MOUNTS ITS OWN RIGHT-CLICK MENU (context-menu-v3 skill). Without it a
 *     right-click inside a floating dossier is answered by whatever page sits
 *     underneath — handing the user THAT page's surface, values and agents
 *     while they look at this record (verified live 2026-08-24).
 *
 * Content is resolved GENERICALLY from what the body rendered (title, type,
 * id, the opener's one-liner, then every field as `Label: value`) — never
 * per type, because this frame shows an arbitrary entity by definition.
 */

import type { ReactNode } from "react";
import { Braces, Copy } from "lucide-react";
import { isEntityTypeToken } from "@ai-matrx/associations";

import type { DetailFrameContext } from "@/lib/detail/types";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import type { ContextMenuExtraSection } from "@/features/context-menu-v3/types";
import {
  createItemDetailScope,
  ITEM_DETAIL_SURFACE_NAME,
} from "@/features/surfaces/manifests/item-detail.manifest";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { copyToClipboard } from "@/components/matrx/buttons/markdown-copy-utils";
import { toast } from "@/lib/toast";

export function ItemDetailFrame({
  ctx,
  children,
}: {
  ctx: DetailFrameContext;
  children: ReactNode;
}) {
  const { ref, recordType, title, about, status, fields } = ctx;

  const recordFields: Record<string, string> = {};
  for (const field of fields) recordFields[field.label] = field.text;

  const dossierText = [
    `# ${title}`,
    `Type: ${recordType.label}`,
    `ID: ${ref.id}`,
    ...(about ? ["", about] : []),
    ...(fields.length > 0 ? ["", ...fields.map((f) => `${f.label}: ${f.text}`)] : []),
  ].join("\n");

  const getScope = () =>
    createItemDetailScope({
      item_type: ref.type,
      item_label: recordType.label,
      item_title: title,
      record_status: status,
      field_count: fields.length,
      content: dossierText,
      item_id: ref.id,
      item_about: about ?? undefined,
      record_fields: fields.length > 0 ? recordFields : undefined,
    });

  // Surface-specific items only — Copy / Copy-as / Export / Download as
  // Markdown / AI already come from the core menu acting on `dossierText`.
  const recordSection: ContextMenuExtraSection = {
    id: "item-detail-record",
    label: "Record",
    icon: Braces,
    items: [
      {
        kind: "item",
        id: "item-detail-copy-id",
        label: "Copy record ID",
        icon: Copy,
        onSelect: () => {
          void copyToClipboard(ref.id, {
            formatJson: false,
            onSuccess: () => toast.success("Record ID copied"),
            onError: () => toast.error("Could not copy record ID"),
          });
        },
      },
      {
        kind: "item",
        id: "item-detail-copy-fields-json",
        label: "Copy fields as JSON",
        icon: Braces,
        disabled: fields.length === 0,
        onSelect: () => {
          void copyToClipboard(JSON.stringify(recordFields, null, 2), {
            formatJson: false,
            onSuccess: () => toast.success("Fields copied"),
            onError: () => toast.error("Could not copy fields"),
          });
        },
      },
    ],
  };

  const entityToken = recordType.entityToken;

  return (
    <SurfaceRuntimeProvider surfaceName={ITEM_DETAIL_SURFACE_NAME} isEditable={false} getScope={getScope}>
      <NonEditableContextMenu
        sourceFeature="system"
        surfaceName={ITEM_DETAIL_SURFACE_NAME}
        contentSource={{ type: "raw" }}
        // Attach To / Share need a REGISTERED entity token — an unrecognised
        // type gets a content-only menu rather than a wrong association edge.
        {...(entityToken && isEntityTypeToken(entityToken)
          ? { entity: { type: entityToken, id: ref.id, title } }
          : {})}
        getApplicationScope={getScope}
        extraSections={[recordSection]}
      >
        {children}
      </NonEditableContextMenu>
    </SurfaceRuntimeProvider>
  );
}
