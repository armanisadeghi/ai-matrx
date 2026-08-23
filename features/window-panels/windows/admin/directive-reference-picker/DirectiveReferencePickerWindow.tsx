"use client";

import { Search } from "lucide-react";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { RecordReferencePicker } from "@/features/matrx-envelope/components/ReferenceTypeAdder";
import type { ReferenceItem } from "@/features/matrx-envelope/envelope";
import type { EntityTypeToken } from "@/types/generated/entity-types.generated";
import { getEntityInfo } from "@/features/scopes/registry/entityRegistry";
import { emitDirectiveReferencePickerEvent } from "./callbacks";

export interface DirectiveReferencePickerWindowProps {
  isOpen: boolean;
  onClose: () => void;
  instanceId: string;
  callbackGroupId?: string | null;
  entityToken: EntityTypeToken;
  fieldKey: string;
  title?: string | null;
}

export function DirectiveReferencePickerWindow({
  isOpen,
  onClose,
  instanceId,
  callbackGroupId,
  entityToken,
  fieldKey,
  title,
}: DirectiveReferencePickerWindowProps) {
  if (!isOpen) return null;
  const info = getEntityInfo(entityToken);

  const handleClose = () => {
    emitDirectiveReferencePickerEvent(callbackGroupId, {
      type: "window-close",
      instanceId,
    });
    onClose();
  };

  const handlePick = (items: ReferenceItem[]) => {
    const item = items[0];
    if (!item || typeof item.id !== "string") return;
    const pickedTitle =
      typeof item.label === "string" && item.label.trim()
        ? item.label.trim()
        : info.label;
    emitDirectiveReferencePickerEvent(callbackGroupId, {
      type: "picked",
      instanceId,
      entityToken,
      fieldKey,
      id: item.id,
      title: pickedTitle,
    });
    handleClose();
  };

  const windowTitle = title?.trim() || `Choose ${info.label}`;
  return (
    <WindowPanel
      id={`directive-reference-picker:${instanceId}`}
      overlayId="directiveReferencePickerWindow"
      title={windowTitle}
      titleNode={
        <span className="flex min-w-0 items-center gap-1.5 text-xs font-medium">
          <Search className="size-3.5 shrink-0 text-primary" />
          <span className="truncate">{windowTitle}</span>
        </span>
      }
      onClose={handleClose}
      width={460}
      height={560}
      minWidth={340}
      minHeight={360}
      position="center"
      bodyClassName="p-0 overflow-hidden"
    >
      <div className="flex h-full min-h-0 flex-col gap-2 p-3">
        <p className="shrink-0 text-xs text-muted-foreground">
          Search accessible {info.labelPlural.toLowerCase()} and select the real
          record for <code className="font-mono">{fieldKey}</code>.
        </p>
        <div className="min-h-0 flex-1">
          <RecordReferencePicker token={entityToken} onPickMany={handlePick} />
        </div>
      </div>
    </WindowPanel>
  );
}

export default DirectiveReferencePickerWindow;
