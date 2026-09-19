"use client";

/**
 * The tiny sidebar the gate tests render.
 *
 * It is NOT a copy of the nav: it reads the REAL `primaryNavItems`, takes the
 * REAL "Data" group's children, and puts them through the REAL
 * `partitionNavChildren` with the REAL `useShellNavGates`. A fixture that
 * declared its own gated child would be a test of itself.
 *
 * Shared by `useShellNavGates.test.tsx` (green) and `useShellNavGates.red.test.tsx`
 * (the red twin), which swaps ONLY the hook — for the one-shot, mount-time
 * organization read the sidebar had until 19 September — so the two files
 * differ in exactly the thing under test.
 */
import {
  partitionNavChildren,
  primaryNavItems,
  type ShellNavChild,
  type ShellNavGates,
} from "@/features/shell/constants/nav-data";
import { useShellNavGates } from "./useShellNavGates";

/** The real children of the real "Data" group. */
export const DATA_NAV_CHILDREN_FOR_TEST: ShellNavChild[] =
  primaryNavItems.find((item) => item.label === "Data")?.children ?? [];

export function GatedDataMenu({ useGates }: { useGates: () => ShellNavGates }) {
  const gates = useGates();
  const { sections, panels } = partitionNavChildren(DATA_NAV_CHILDREN_FOR_TEST, gates);
  const shown = [...sections.flatMap((section) => section.items), ...panels];
  return (
    <ul>
      {shown.map((child, index) => (
        <li key={`${child.label}-${index}`} data-testid={child.href === "/data-v2" ? "records-entry" : undefined}>
          {child.label}
        </li>
      ))}
    </ul>
  );
}

/** The menu as the app wires it: the real hook. */
export function gatesToEntry() {
  return <GatedDataMenu useGates={useShellNavGates} />;
}
