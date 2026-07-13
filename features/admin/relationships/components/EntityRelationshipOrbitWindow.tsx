"use client";

// features/admin/relationships/components/EntityRelationshipOrbitWindow.tsx
//
// Page-local WindowPanel composition root wrapping EntityRelationshipOrbit —
// "Open in window" from the Relationship Manager list page, no navigation.
// Always reached via a dynamic({ ssr: false }) import (see EntityExplorerEntry)
// so WindowPanel stays out of the list page's eager bundle.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Maximize2 } from "lucide-react";

import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { tryGetEntityInfo } from "@/features/scopes/registry/entityRegistry";
import { Button } from "@/components/ui/button";
import { EntityRelationshipOrbit } from "./EntityRelationshipOrbit";
import type { RelationshipRule } from "../types";

interface Props {
  token: string;
  rules: RelationshipRule[];
  onClose: () => void;
}

export default function EntityRelationshipOrbitWindow({
  token,
  rules,
  onClose,
}: Props) {
  const router = useRouter();
  const [activeToken, setActiveToken] = useState(token);
  const info = tryGetEntityInfo(activeToken);

  return (
    <WindowPanel
      id={`entity-orbit-${activeToken}`}
      onClose={onClose}
      title={info?.label ?? activeToken}
      width={880}
      height={520}
      minWidth={520}
      minHeight={340}
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
      actionsRight={
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          title="Open full page"
          onClick={() => {
            router.push(
              `/administration/relationships/explorer/${activeToken}`,
            );
            onClose();
          }}
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </Button>
      }
    >
      <EntityRelationshipOrbit
        token={activeToken}
        rules={rules}
        onSelectToken={setActiveToken}
      />
    </WindowPanel>
  );
}
