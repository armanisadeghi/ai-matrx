"use client";

import { useState } from "react";
import type { SandboxInstance, SandboxProbeResponse } from "@/types/sandbox";
import { ACTIVE_SANDBOX_STATUSES } from "@/types/sandbox";
import { sandboxDisplayName } from "@/lib/sandbox/format";
import { getEffectiveStatus } from "@/lib/sandbox/status";
import { useAppDispatch, useAppStore } from "@/lib/redux/hooks";
import { SandboxFilesystemAdapter } from "../../adapters/SandboxFilesystemAdapter";
import {
  MockProcessAdapter,
  SandboxProcessAdapter,
} from "../../adapters/SandboxProcessAdapter";
import { MockFilesystemAdapter } from "../../adapters/MockFilesystemAdapter";
import { useCodeWorkspace } from "../../CodeWorkspaceProvider";
import { openSessionReportTab } from "../../runtime/openSessionReport";
import {
  selectActiveSandboxId,
  setActiveSandbox,
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

export interface SandboxWorkspaceConnectOptions {
  /** A URL restoration reconnects the sandbox without replacing restored UI state. */
  restore?: boolean;
}

/** The sole path for connecting a sandbox to a CodeWorkspace. */
export function useSandboxWorkspaceConnection({
  onError,
  onSandboxGone,
  onProbe,
  onConnected,
}: UseSandboxWorkspaceConnectionOptions) {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const { setFilesystem, setProcess } = useCodeWorkspace();
  const [connectingId, setConnectingId] = useState<string | null>(null);

  const wireInstance = (
    instance: SandboxInstance,
    options: SandboxWorkspaceConnectOptions = {},
  ) => {
    dispatch(setActiveSandbox(instance));
    const label = sandboxDisplayName(instance);
    const rootPath = instance.hot_path || "/home/agent";
    const filesystem = new SandboxFilesystemAdapter(
      instance.id,
      label,
      rootPath,
    );
    setFilesystem(filesystem);
    setProcess(new SandboxProcessAdapter(instance.id, rootPath));
    // A URL restore has an explicit file target. Do not let this optional,
    // delayed report replace it; ordinary user-driven connections still get
    // the recovery report as before.
    if (!options.restore) {
      void openSessionReportTab({
        adapter: filesystem,
        sandboxId: instance.id,
        dispatch,
        canOpen: () => selectActiveSandboxId(store.getState()) === instance.id,
      });
    }
  };

  /** Disconnect without selecting a replacement view or terminal tab. */
  const disconnect = () => {
    dispatch(setActiveSandbox(null));
    setFilesystem(new MockFilesystemAdapter());
    setProcess(new MockProcessAdapter());
  };

  const connect = async (
    instance: SandboxInstance,
    options: SandboxWorkspaceConnectOptions = {},
  ): Promise<boolean> => {
    const effective = getEffectiveStatus(instance);
    if (!ACTIVE_SANDBOX_STATUSES.includes(effective)) {
      onError(
        `Sandbox ${sandboxDisplayName(instance)} is ${effective}. Start it, then try again.`,
      );
      return false;
    }

    setConnectingId(instance.id);
    wireInstance(instance, options);
    onConnected?.(instance);
    if (!options.restore) {
      dispatch(setActiveView("explorer"));
      dispatch(setBottomOpen(true));
      dispatch(setBottomActiveTab("terminal"));
    }

    void (async () => {
      try {
        const response = await fetch(`/api/sandbox/${instance.id}/probe`, {
          method: "POST",
        });
        if (!response.ok) return;
        const probe = (await response.json()) as SandboxProbeResponse;
        onProbe?.(instance.id, probe);
        if (
          probe.aliveness === "gone" &&
          selectActiveSandboxId(store.getState()) === instance.id
        ) {
          disconnect();
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

    return true;
  };

  return { connect, connectingId, wireInstance, disconnect };
}
