"use client";

// Moved out of app/(dev)/demos/resizables/_lib/ into features/resizable-panels/
// so the (dev) route group can be parked. (dev)-helper-leak audit, 2026-07-28.

import { createContext, useContext, useEffect } from "react";
import {
  Group,
  useGroupRef,
  type GroupProps,
  type Layout,
} from "react-resizable-panels";
import { usePanelControlsOptional } from "./PanelControlProvider";

const GroupDefaultLayoutContext = createContext<Layout | undefined>(undefined);

/** The `defaultLayout` (the server-read cookie) of the nearest ClientGroup —
 *  exactly what the library mounts the group with. RegisteredPanel reads it to
 *  paint a saved-collapsed column collapsed on the server. */
export function useGroupDefaultLayout(): Layout | undefined {
  return useContext(GroupDefaultLayoutContext);
}

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
//   cross-tree toggle buttons can call setLayout on the right group, and
//   reports every SETTLED layout so the provider remembers each panel's last
//   open size (a drag-collapse then reopens at the width before the drag).
// - Shares its defaultLayout with the RegisteredPanels inside it (see
//   useGroupDefaultLayout).
export function ClientGroup({ cookieName, groupKey, children, ...props }: Props) {
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
        if (groupKey && controls) {
          controls.notifyLayoutChanged(groupKey, layout);
        }
      }}
    >
      <GroupDefaultLayoutContext value={props.defaultLayout}>
        {children}
      </GroupDefaultLayoutContext>
    </Group>
  );
}
