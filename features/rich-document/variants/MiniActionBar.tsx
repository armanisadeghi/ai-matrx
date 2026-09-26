"use client";

// features/rich-document/variants/MiniActionBar.tsx
//
// "mini-bar" variant — the same Alchemy bar layout, condensed.

import * as React from "react";
import { ActionBar, type ActionBarProps } from "./ActionBar";

export type MiniActionBarProps = Omit<ActionBarProps, "mini" | "hideOverflow">;

export function MiniActionBar(props: MiniActionBarProps): React.ReactElement {
  return <ActionBar {...props} mini />;
}

export default MiniActionBar;
