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
// "Edit Shape" only appears where it actually GOES somewhere. The owner
// editor lives on the Preview route and is the first thing on that page, so
// on Preview the button's whole job — take me to the editor — is already
// done, and pressing it visibly did nothing (measured: the editor sits 56px
// down at scrollTop 0). A control whose success looks identical to a broken
// one IS a broken one, so it is hidden there and rendered on the other tabs,
// where it genuinely navigates back to Preview and lands on the editor.
//
// (It was also a plain `#shape-editor` href, which is a hard no-op once that
// hash is in the URL — no navigation, no hashchange, no scroll. It scrolls
// imperatively now, so it works on every press, not just the first.)

import {
  Boxes,
  BrainCircuit,
  Eye,
  FileJson,
  FlaskConical,
  Pencil,
  Radio,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
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
  const pathname = usePathname();
  const { launch, launching } = useKindAgentLaunch(
    SHAPES_SURFACE_NAME,
    SHAPE_BUILDER_ROLE,
  );

  const detailHref = shapeDetailHref(kind);
  // The owner editor is rendered by the Preview route only.
  const editorIsOnThisPage = pathname === detailHref;

  // The owner editor lives on the Preview route only. On Preview, scroll to
  // it imperatively (idempotent — works on every click); from any other tab,
  // navigate there with the hash so the browser lands on it.
  function openOwnerEditor() {
    const node =
      typeof document !== "undefined"
        ? document.getElementById(SHAPE_EDITOR_ANCHOR_ID)
        : null;
    if (node) {
      // `behavior: "auto"`, deliberately. Nesting is NOT the reason — smooth
      // scrolling `.shell-main` (what actually scrolls on a (core) route) was
      // re-measured on 2026-08-24 and animates correctly to its exact target.
      // The earlier "smooth is a no-op" reading was an automation artifact: the
      // preview browser reports `document.hidden`, so rAF is starved and the
      // animation never ticks. A real user never sees that. This button still
      // jumps because it is a one-shot "take me there" affordance that must
      // land even in a rAF-starved tab, and it has no animation to lose.
      node.scrollIntoView({ behavior: "auto", block: "start" });
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

  // The agent action is the PRIMARY pill on purpose: only primary/destructive
  // actions render their name inline in this template, and an unlabeled AI
  // icon next to an unlabeled pencil is precisely how "I don't know what the
  // difference is" happens. The owner editor is already on screen on Preview,
  // so "Edit Shape" is a jump-to, and reads fine as a tooltipped pencil.
  const agentAction = {
    label: isOwnedByViewer ? "Edit with agent" : "Build with agent",
    icon: BrainCircuit,
    onPress: launchAgent,
    disabled: launching,
    primary: true,
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
        isOwnedByViewer && !editorIsOnThisPage
          ? [
              {
                label: "Edit Shape",
                icon: Pencil,
                onPress: openOwnerEditor,
              },
              agentAction,
            ]
          : [agentAction]
      }
    />
  );
}
