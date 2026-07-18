"use client";

// Shape detail header — the canonical EntityModeHeader template (the agents
// pattern): back to the list, shape name, Preview | Test | Instances | Schema mode nav,
// and the ONE primary action (Build with agent). Mobile collapses modes +
// actions into the template's bottom drawer automatically.

import { Boxes, Eye, FileJson, FlaskConical, PencilRuler } from "lucide-react";
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
}

export default function ShapeDetailHeader({ kind, label }: ShapeDetailHeaderProps) {
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
      actions={[
        {
          label: "Build with agent",
          icon: PencilRuler,
          href: SHAPES_NEW_HREF,
          primary: true,
        },
      ]}
    />
  );
}
