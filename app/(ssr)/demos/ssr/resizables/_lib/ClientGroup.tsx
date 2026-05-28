"use client";

import { useEffect } from "react";
import {
  Group,
  useGroupRef,
  type GroupProps,
} from "react-resizable-panels";
import { usePanelControlsOptional } from "./PanelControlProvider";

type Props = Omit<GroupProps, "onLayoutChange" | "onLayoutChanged" | "groupRef"> & {
  cookieName: string;
  /** Optional — when provided AND a <PanelControlProvider> is above, the
   *  group's groupRef is registered so cross-portal toggle buttons can call
   *  setLayout() on it. Demos that don't need cross-portal toggling can
   *  omit groupKey (and the provider) entirely. */
  groupKey?: string;
};

// Thin 'use client' wrapper around <Group>.
// - Writes the cookie on pointer-up (onLayoutChanged, past tense).
// - Optionally exposes its groupRef to PanelControlProvider via groupKey so
//   cross-tree toggle buttons can call setLayout on the right group.
export function ClientGroup({ cookieName, groupKey, ...props }: Props) {
  const groupRef = useGroupRef();
  const controls = usePanelControlsOptional();

  useEffect(() => {
    if (groupKey && controls) {
      controls.registerGroup(groupKey, groupRef);
    }
  }, [controls, groupKey, groupRef]);

  return (
    <Group
      {...props}
      groupRef={groupRef}
      onLayoutChanged={(layout) => {
        document.cookie =
          `${cookieName}=${encodeURIComponent(JSON.stringify(layout))}` +
          `; path=/; max-age=31536000; SameSite=Lax`;
      }}
    />
  );
}
