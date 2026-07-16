"use client";

// Demo wrapper — promoted ContextTree with fake inline creates enabled.
import {
  ContextTree as PromotedContextTree,
  type ContextTreeCreateHandler,
} from "@/features/scopes/components/active-context/context-tree/ContextTree";
import type { ContextTreeData } from "@/features/scopes/components/active-context/context-tree/shared";
import type { DenseSelection, SelectMode } from "./model";
import { fakeCreate } from "./shared";

export function ContextTree({
  data,
  selection,
  onChange,
  mode,
  onCommit,
  height,
  showSearch,
  header,
  autoFocus,
  className,
}: {
  data: ContextTreeData;
  selection: DenseSelection;
  onChange: (sel: DenseSelection) => void;
  mode?: SelectMode;
  onCommit?: (sel: DenseSelection) => void;
  height?: number;
  showSearch?: boolean;
  header?: string;
  autoFocus?: boolean;
  className?: string;
}) {
  const onCreate: ContextTreeCreateHandler = (level, name, detail) =>
    fakeCreate(level, name, detail);

  return (
    <PromotedContextTree
      data={data}
      selection={selection}
      onChange={onChange}
      mode={mode}
      onCommit={onCommit}
      height={height}
      showSearch={showSearch}
      header={header}
      autoFocus={autoFocus}
      className={className}
      allowCreate
      onCreate={onCreate}
    />
  );
}
