"use client";

// features/applets/browse/AppletsListPage.tsx
//
// /applets (signed in) — every Applet the person can see, on the canonical
// list shell. ONE create button (here), ONE list copy control and ONE row
// menu (the shell's). Replaces the hand-built card grid, which offered Create
// twice and ten icon buttons per card.

import Link from "next/link";
import { LayoutTemplate, Plus } from "lucide-react";
import { Button as ControlButton } from "@ai-matrx/design-system/controls";
import { RecordPageHeader } from "@/features/shell/components/header/templates/RecordPageHeader";
import { EntityListPage } from "@/lib/entity-list/components/EntityListPage";
import { appletListConfig } from "./listConfig";
import { APPLET_LIST_SURFACE } from "./surface";

function NewAppletButton() {
  return (
    <ControlButton variant="primary" asChild icon={<Plus className="h-4 w-4" />} collapse="container">
      <Link href="/applets/build" aria-label="New Applet">
        New Applet
      </Link>
    </ControlButton>
  );
}

/** The first-run doors: build one by talking, or start from a template (audit L1). */
function FirstAppletActions() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <ControlButton variant="primary" asChild icon={<Plus className="h-4 w-4" />}>
        <Link href="/applets/build">Build your first Applet</Link>
      </ControlButton>
      <ControlButton variant="outline" asChild icon={<LayoutTemplate className="h-4 w-4" />}>
        <Link href={APPLET_TEMPLATES_HREF}>Start from a template</Link>
      </ControlButton>
    </div>
  );
}

export const APPLET_TEMPLATES_HREF = "/templates/applets";

export function AppletsListPage() {
  return (
    <>
      <RecordPageHeader record={{ name: "Applets" }} />
      <EntityListPage
        config={appletListConfig}
        surface={APPLET_LIST_SURFACE}
        headerActions={<NewAppletButton />}
        emptyAction={<FirstAppletActions />}
      />
    </>
  );
}
