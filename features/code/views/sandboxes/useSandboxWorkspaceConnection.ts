"use client";

import { useState } from "react";
import type { SandboxInstance, SandboxProbeResponse } from "@/types/sandbox";
import { ACTIVE_SANDBOX_STATUSES } from "@/types/sandbox";
import { sandboxDisplayName } from "@/lib/sandbox/format";
import { getEffectiveStatus } from "@/lib/sandbox/status";
import { useAppDispatch } from "@/lib/redux/hooks";
import { SandboxFilesystemAdapter } from "../../adapters/SandboxFilesystemAdapter";
import { SandboxProcessAdapter } from "../../adapters/SandboxProcessAdapter";
import { useCodeWorkspace } from "../../CodeWorkspaceProvider";
import { openSessionReportTab } from "../../runtime/openSessionReport";
import {
  setActiveSandboxId,
  setActiveSandboxProxyUrl,
  setActiveView,
} from "../../redux/codeWorkspaceSlice";
import {
  setActiveTab as setBottomActiveTab,
  setOpen as setBottomOpen,
} from "../../redux/terminalSlice";

interface UseSandboxWorkspaceConnectionOptions {
  onError: (message: string) => void;
  onSandboxGone?: () => void;
  onProbe?: (instanceId: string, probe: SandboxProbeResponse) => void;
  onConnected?: (instance: SandboxInstance) => void;
}

/** The sole path for connecting a sandbox to a CodeWorkspace. */
export function useSandboxWorkspaceConnection({
  onError,
  onSandboxGone,
  onProbe,
  onConnected,
}: UseSandboxWorkspaceConnectionOptions) {
  const dispatch = useAppDispatch();
  const { setFilesystem, setProcess } = useCodeWorkspace();
  const [connectingId, setConnectingId] = useState<string | null>(null);

  const wireInstance = (instance: SandboxInstance) => {
    dispatch(setActiveSandboxId(instance.id));
    dispatch(setActiveSandboxProxyUrl(instance.proxy_url ?? null));
    const label = sandboxDisplayName(instance);
    const rootPath = instance.hot_path || "/home/agent";
    const filesystem = new SandboxFilesystemAdapter(
      instance.id,
      label,
      rootPath,
    );
    setFilesystem(filesystem);
    setProcess(new SandboxProcessAdapter(instance.id, rootPath));
    void openSessionReportTab({
      adapter: filesystem,
      sandboxId: instance.id,
      dispatch,
    });
  };

  const connect = (instance: SandboxInstance) => {
    const effective = getEffectiveStatus(instance);
    if (!ACTIVE_SANDBOX_STATUSES.includes(effective)) {
      onError(
        `Sandbox ${sandboxDisplayName(instance)} is ${effective}. Start it, then try again.`,
      );
      return;
    }

    setConnectingId(instance.id);
    wireInstance(instance);
    onConnected?.(instance);
    dispatch(setActiveView("explorer"));
    dispatch(setBottomOpen(true));
    dispatch(setBottomActiveTab("terminal"));

    void (async () => {
      try {
        const response = await fetch(`/api/sandbox/${instance.id}/probe`, {
          method: "POST",
        });
        if (!response.ok) return;
        const probe = (await response.json()) as SandboxProbeResponse;
        onProbe?.(instance.id, probe);
        if (probe.aliveness === "gone") {
          dispatch(setActiveSandboxId(null));
          dispatch(setActiveSandboxProxyUrl(null));
          onError(
            `Sandbox ${sandboxDisplayName(instance)} no longer exists. Choose another sandbox to open its files.`,
          );
          onSandboxGone?.();
        }
      } catch (error) {
        console.warn(
          "[useSandboxWorkspaceConnection] sandbox probe failed:",
          error,
        );
      } finally {
        setConnectingId((current) =>
          current === instance.id ? null : current,
        );
      }
    })();
  };

  return { connect, connectingId, wireInstance };
}
