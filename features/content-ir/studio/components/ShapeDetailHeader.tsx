"use client";

// Shape detail header — the canonical EntityModeHeader template (the agents
// pattern): back to the list, shape name, Preview | Test | Instances | Schema mode nav,
// and the context-appropriate primary action (Edit for owners, Build with
// agent otherwise). Mobile collapses modes + actions into the template's
// bottom drawer automatically.

import {
  Boxes,
  Eye,
  FileJson,
  FlaskConical,
  Pencil,
  PencilRuler,
} from "lucide-react";
import { EntityModeHeader } from "@/features/shell/components/header/templates/EntityModeHeader";
import {
  SHAPES_NEW_HREF,
  SHAPES_ROUTE_BASE,
  shapeDetailHref,
  shapeInstancesHref,
  shapeSchemaHref,
  shapeTestHref,
} from "@/features/content-ir/studio/constants";

interface ShapeDetailHeaderProps {
  kind: string;
  label: string;
  isOwnedByViewer?: boolean;
}

export default function ShapeDetailHeader({
  kind,
  label,
  isOwnedByViewer = false,
}: ShapeDetailHeaderProps) {
  return (
    <EntityModeHeader
      backHref={SHAPES_ROUTE_BASE}
      entityLabel={label}
      modes={[
        { name: "Preview", href: shapeDetailHref(kind), icon: Eye },
        { name: "Test", href: shapeTestHref(kind), icon: FlaskConical },
        { name: "Instances", href: shapeInstancesHref(kind), icon: Boxes },
        { name: "Schema", href: shapeSchemaHref(kind), icon: FileJson },
      ]}
      actions={
        isOwnedByViewer
          ? [
              {
                label: "Edit Shape",
                icon: Pencil,
                href: `${shapeDetailHref(kind)}#shape-editor`,
                primary: true,
              },
              {
                label: "Build with agent",
                icon: PencilRuler,
                href: SHAPES_NEW_HREF,
              },
            ]
          : [
              {
                label: "Build with agent",
                icon: PencilRuler,
                href: SHAPES_NEW_HREF,
                primary: true,
              },
            ]
      }
    />
  );
}
