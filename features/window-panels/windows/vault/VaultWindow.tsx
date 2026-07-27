"use client";

/**
 * Vault as a floating window — the credential store available beside whatever
 * you are actually working on, which is the point: you need a password while
 * you are in the middle of something else, not on a dedicated page.
 *
 * Renders the ONE `VaultWorkspace` (features/secrets/FEATURE.md). Reveal
 * behavior is unchanged here: values are component-local and auto-clear, and
 * nothing plaintext is ever collected into the window's persisted `data`.
 */
import { useCallback, useState } from "react";

import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { VaultWorkspace } from "@/features/secrets/components/VaultWorkspace";

export interface VaultWindowProps {
  isOpen: boolean;
  onClose: () => void;
  instanceId?: string;
  /** Restored from `window_sessions.data` — see the registry `defaultData`. */
  initialSelectedItemId?: string | null;
  initialScope?: string | null;
}

export default function VaultWindow({
  isOpen,
  onClose,
  instanceId = "default",
  initialSelectedItemId = null,
  initialScope = null,
}: VaultWindowProps) {
  if (!isOpen) return null;
  return (
    <VaultWindowInner
      onClose={onClose}
      instanceId={instanceId}
      initialSelectedItemId={initialSelectedItemId}
      initialScope={initialScope}
    />
  );
}

function VaultWindowInner({
  onClose,
  instanceId,
  initialSelectedItemId,
  initialScope,
}: Omit<VaultWindowProps, "isOpen">) {
  const [selectedItemId, setSelectedItemId] = useState<string | null>(
    initialSelectedItemId ?? null,
  );
  const [scope, setScope] = useState<string>(initialScope ?? "mine");

  // Only non-secret UI position is persisted — an item id and which scope tab
  // was open. Never a field value, never a revealed secret.
  const collectData = useCallback(
    (): Record<string, unknown> => ({ selectedItemId, scope }),
    [selectedItemId, scope],
  );

  return (
    <WindowPanel
      id={`credential-vault-${instanceId}`}
      title="Vault"
      onClose={onClose}
      minWidth={560}
      minHeight={460}
      width={900}
      height={640}
      position="center"
      overlayId="credentialVaultWindow"
      onCollectData={collectData}
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-y-auto p-3"
    >
      <VaultWorkspace
        principal={{ type: "user" }}
        selectedItemId={selectedItemId}
        onSelectedItemIdChange={setSelectedItemId}
        scope={scope}
        onScopeChange={setScope}
      />
    </WindowPanel>
  );
}
