"use client";

// features/rich-document/variants/MenuVariant.tsx
//
// "menu" / "icon-only" variant — a single ⋯ trigger. The Alchemy package's
// overflow layout on desktop, its bottom sheet on a phone (loaded on first
// tap); primaries are inside, so nothing is hidden. Where the content already
// has its right-click menu, ⋯ opens that one menu (RC-B6).

import * as React from "react";
import dynamic from "next/dynamic";
import { MoreHorizontal } from "lucide-react";
import { OverflowMenu } from "@ai-matrx/alchemy/react/overflow";
import type { ClickTarget } from "@ai-matrx/alchemy/actions";
import { useAlchemyActions } from "@ai-matrx/alchemy/react/host";
import { ensureRichDocumentProvider } from "../actions/provider";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { OpenOneMenuButton, useOneMenuFor } from "./shared/OpenOneMenuButton";
import type { RichDocumentActionContext } from "../types";

const ActionSheet = dynamic(
  () => import("@ai-matrx/alchemy/react/sheet").then((m) => m.ActionSheet),
  { ssr: false },
);

export interface MenuVariantProps {
  getCtx: () => RichDocumentActionContext;
  target: ClickTarget;
  className?: string;
}

function Trigger(props: React.ComponentProps<typeof Button>): React.ReactElement {
  return (
    <Button variant="ghost" size="icon" className="h-8 w-8 p-0" aria-label="More actions" {...props}>
      <MoreHorizontal className="h-4 w-4" />
    </Button>
  );
}

export function MenuVariant(props: MenuVariantProps): React.ReactElement {
  const { getCtx, target, className } = props;
  const isMobile = useIsMobile();
  // Idempotent: the one registry gets the rich-document provider once.
  ensureRichDocumentProvider(useAlchemyActions().registry);
  const oneMenu = useOneMenuFor(getCtx().source);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  return (
    <div className={cn("inline-flex items-center", className)}>
      {oneMenu ? (
        <OpenOneMenuButton />
      ) : isMobile ? (
        <>
          <Trigger onClick={() => setSheetOpen(true)} />
          {sheetOpen ? <ActionSheet target={target} open={sheetOpen} onOpenChange={setSheetOpen} /> : null}
        </>
      ) : (
        <OverflowMenu target={target} trigger={<Trigger />} />
      )}
    </div>
  );
}

export default MenuVariant;
