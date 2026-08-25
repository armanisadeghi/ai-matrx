"use client";

// Shape detail header — the canonical EntityModeHeader template (the agents
// pattern): back to the list, shape name, Preview | Test | Stream | Instances |
// Schema mode nav, and the two context-appropriate actions.
//
// THE TWO ACTIONS ARE DIFFERENT JOBS, and the labels say which:
//   "Edit Shape"       — YOU edit it, by hand, in the owner editor on the
//                        Preview tab. Owner-only.
//   "Edit with agent"  — THE AGENT edits it: the studio's `shape_builder`
//                        role opens in a window ON THIS PAGE with the live
//                        surface scope (this kind, its schema, its samples,
//                        its activation verdict) plus a composed brief on its
//                        declared variables. No navigation, no form first.
// A non-owner cannot edit this shape, so their agent action builds a NEW one
// (still carrying this kind's context — "something like this one").
//
// Both actions used to be plain hrefs. "Edit Shape" pointed at
// `#shape-editor`, which silently does NOTHING once that hash is already in
// the URL (no navigation, no hashchange) — the "it stopped working" bug. It
// scrolls imperatively now, so the second click works like the first.

import {
  Boxes,
  BrainCircuit,
  Eye,
  FileJson,
  FlaskConical,
  Pencil,
  Radio,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { EntityModeHeader } from "@/features/shell/components/header/templates/EntityModeHeader";
import type { Json } from "@/types/database.types";
import {
  SHAPES_ALL_HREF,
  SHAPES_SURFACE_NAME,
  SHAPE_BUILDER_ROLE,
  shapeDetailHref,
  shapeInstancesHref,
  shapeSchemaHref,
  shapeStreamHref,
  shapeTestHref,
} from "@/features/content-ir/studio/constants";
import {
  composeKindAgentIntent,
  composeNewShapeIntent,
} from "@/features/content-ir/studio/kind-agent-intents";
import { useKindAgentLaunch } from "@/features/content-ir/studio/useKindAgentLaunch";
import { SHAPE_EDITOR_ANCHOR_ID } from "@/features/content-ir/studio/components/ShapeOwnerEditor";

interface ShapeDetailHeaderProps {
  kind: string;
  label: string;
  isOwnedByViewer?: boolean;
  /** The kind's emitted JSON Schema — rides its own agent variable. */
  emittedJsonSchema?: Json | null;
}

export default function ShapeDetailHeader({
  kind,
  label,
  isOwnedByViewer = false,
  emittedJsonSchema = null,
}: ShapeDetailHeaderProps) {
  const router = useRouter();
  const { launch, launching } = useKindAgentLaunch(
    SHAPES_SURFACE_NAME,
    SHAPE_BUILDER_ROLE,
  );

  const detailHref = shapeDetailHref(kind);

  // The owner editor lives on the Preview route only. On Preview, scroll to
  // it imperatively (idempotent — works on every click); from any other tab,
  // navigate there with the hash so the browser lands on it.
  function openOwnerEditor() {
    const node =
      typeof document !== "undefined"
        ? document.getElementById(SHAPE_EDITOR_ANCHOR_ID)
        : null;
    if (node) {
      node.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    router.push(`${detailHref}#${SHAPE_EDITOR_ANCHOR_ID}`);
  }

  function launchAgent() {
    void launch(
      isOwnedByViewer
        ? composeKindAgentIntent({
            kind,
            label,
            part: "edit",
            emittedJsonSchema,
          })
        : composeNewShapeIntent({ likeKind: kind, likeLabel: label }),
    );
  }

  const agentAction = {
    label: isOwnedByViewer ? "Edit with agent" : "Build with agent",
    icon: BrainCircuit,
    onPress: launchAgent,
    disabled: launching,
    primary: !isOwnedByViewer,
  };

  return (
    <EntityModeHeader
      backHref={SHAPES_ALL_HREF}
      entityLabel={label}
      modes={[
        { name: "Preview", href: detailHref, icon: Eye },
        { name: "Test", href: shapeTestHref(kind), icon: FlaskConical },
        { name: "Stream", href: shapeStreamHref(kind), icon: Radio },
        { name: "Instances", href: shapeInstancesHref(kind), icon: Boxes },
        { name: "Schema", href: shapeSchemaHref(kind), icon: FileJson },
      ]}
      actions={
        isOwnedByViewer
          ? [
              {
                label: "Edit Shape",
                icon: Pencil,
                onPress: openOwnerEditor,
                primary: true,
              },
              agentAction,
            ]
          : [agentAction]
      }
    />
  );
}
