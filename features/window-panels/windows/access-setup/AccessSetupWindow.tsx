"use client";

// The People involved window — wraps THE canonical panels (features/access-setup), never a copy.
// Ephemeral: opened at the moment of creation or from a record's People involved action.

import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@ai-matrx/design-system/controls";

import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { AccessSetupPanel } from "@/features/access-setup/components/AccessSetupPanel";
import { CycleAccessSetupPanel } from "@/features/access-setup/components/CycleAccessSetupPanel";

interface AccessSetupWindowProps {
  isOpen: boolean;
  onClose: () => void;
  headType: string;
  recordId: string | null;
  cycleId: string | null;
  recordName: string | null;
}

export default function AccessSetupWindow({ isOpen, ...rest }: AccessSetupWindowProps) {
  if (!isOpen) return null;
  return <AccessSetupWindowInner {...rest} />;
}

function AccessSetupWindowInner({ onClose, headType, recordId, cycleId, recordName }: Omit<AccessSetupWindowProps, "isOpen">) {
  // inside a cycle panel, one review's People involved opens in place, with a way back
  const [review, setReview] = useState<{ id: string; name: string } | null>(null);
  const showRecord = review ?? (recordId ? { id: recordId, name: recordName ?? "" } : null);
  const title = showRecord?.name ? `People involved · ${showRecord.name}` : "People involved";

  return (
    <WindowPanel
      title={title}
      id="access-setup-window"
      minWidth={360}
      minHeight={320}
      width={480}
      height={600}
      position="center"
      onClose={onClose}
      overlayId="accessSetupWindow"
      onCollectData={() => ({ headType, recordId, cycleId, recordName })}
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
    >
      {review && cycleId ? (
        <div className="shrink-0 border-b border-border px-2 py-1">
          <Button variant="quiet" icon={<ArrowLeft className="h-4 w-4" />} onClick={() => setReview(null)}>
            All reviews
          </Button>
        </div>
      ) : null}
      {showRecord ? (
        <AccessSetupPanel key={showRecord.id} entityType={headType} recordId={showRecord.id} />
      ) : cycleId ? (
        <CycleAccessSetupPanel cycleId={cycleId} onOpenReview={(id, name) => setReview({ id, name })} />
      ) : null}
    </WindowPanel>
  );
}
