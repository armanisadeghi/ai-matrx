"use client";

import { useEffect, useRef } from "react";
import type { SandboxInstance } from "@/types/sandbox";
import { useSandboxWorkspaceConnection } from "./useSandboxWorkspaceConnection";

interface SandboxDeepLinkConnectionProps {
  instance: SandboxInstance;
  onError: (message: string) => void;
  onConnected: () => void;
}

/** Connects an authenticated `/code?sandbox=` target through the shared path. */
export function SandboxDeepLinkConnection({
  instance,
  onError,
  onConnected,
}: SandboxDeepLinkConnectionProps) {
  const connectedId = useRef<string | null>(null);
  const { connect } = useSandboxWorkspaceConnection({ onError, onConnected });

  useEffect(() => {
    if (connectedId.current === instance.id) return;
    connectedId.current = instance.id;
    void connect(instance, { restore: true });
  }, [connect, instance]);

  return null;
}
