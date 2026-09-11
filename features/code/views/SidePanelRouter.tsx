"use client";

import React from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectActiveView } from "../redux/codeWorkspaceSlice";
import { ExplorerSandboxSplit } from "./explorer/ExplorerSandboxSplit";
import { SearchPanel } from "./search/SearchPanel";
import { SourceControlPanel } from "./source-control/SourceControlPanel";
import { RunPanel } from "./run/RunPanel";
import { ExtensionsPanel } from "./extensions/ExtensionsPanel";
import { SandboxesPanel } from "./sandboxes/SandboxesPanel";
import { LibraryPanel } from "./library/LibraryPanel";

/**
 * Dispatches to the right side-panel view based on the active activity bar
 * selection. Keeping this switch here (rather than mounting all views at
 * once) keeps DOM lightweight and ensures each view remounts with a fresh
 * state whenever the user actively picks it.
 */
export const SidePanelRouter: React.FC = () => {
  const activeView = useAppSelector(selectActiveView);

  switch (activeView) {
    case "explorer":
      return <ExplorerSandboxSplit />;
    case "search":
      return <SearchPanel />;
    case "source-control":
    case "git":
      return <SourceControlPanel />;
    case "run":
      return <RunPanel />;
    case "extensions":
      return <ExtensionsPanel />;
    case "sandboxes":
      return <SandboxesPanel />;
    case "library":
      return <LibraryPanel />;
    default:
      return null;
  }
};
