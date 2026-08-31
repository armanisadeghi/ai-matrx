"use client";

import { useEffect, useRef, useState } from "react";
import { executeSqlQuery } from "@/actions/admin/database";
import { interpolateQuery } from "../utils/interpolate";
import { toRows } from "../utils/joinResults";
import type {
  MergeConfig,
  MergeResult,
  QueryBlockState,
  Variable,
  WorkbenchPersistedState,
} from "../types";

const STORAGE_KEY = "db-workbench-v1";

const DEFAULT_MERGE_CONFIG: MergeConfig = {
  leftBlockId: null,
  rightBlockId: null,
  leftKey: null,
  rightKey: null,
  mode: "concat",
  timelineKey: "created_at",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJoinMode(value: unknown): value is MergeConfig["mode"] {
  return (
    value === "concat" ||
    value === "inner" ||
    value === "left" ||
    value === "embed" ||
    value === "timeline"
  );
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isPersistedBlock(
  value: unknown,
): value is Pick<QueryBlockState, "id" | "label" | "query"> {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.label === "string" &&
    typeof value.query === "string"
  );
}

function isVariable(value: unknown): value is Variable {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.value === "string"
  );
}

function parseMergeConfig(value: unknown): MergeConfig | null {
  if (!isRecord(value)) return null;
  const { leftBlockId, rightBlockId, leftKey, rightKey, mode, timelineKey } =
    value;
  if (
    !isNullableString(leftBlockId) ||
    !isNullableString(rightBlockId) ||
    !isNullableString(leftKey) ||
    !isNullableString(rightKey) ||
    !isJoinMode(mode) ||
    typeof timelineKey !== "string"
  ) {
    return null;
  }
  return {
    leftBlockId,
    rightBlockId,
    leftKey,
    rightKey,
    mode,
    timelineKey,
  };
}

export function parseWorkbenchPersistedState(
  raw: string,
): WorkbenchPersistedState | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      !isRecord(parsed) ||
      !Array.isArray(parsed.blocks) ||
      !parsed.blocks.every(isPersistedBlock) ||
      !Array.isArray(parsed.variables) ||
      !parsed.variables.every(isVariable)
    ) {
      return null;
    }
    const mergeConfig = parseMergeConfig(parsed.mergeConfig);
    if (!mergeConfig) return null;
    return {
      blocks: parsed.blocks,
      variables: parsed.variables,
      mergeConfig,
    };
  } catch {
    return null;
  }
}

const SAMPLE_BLOCKS: QueryBlockState[] = [
  {
    id: "block-1",
    label: "Tool Calls",
    query:
      "select * from public.cx_tool_call where conversation_id = '{{:conversation_id}}'",
    status: "idle",
    result: null,
    error: null,
    executionTime: null,
    rowCount: null,
    resolvedQuery: null,
    ranAt: null,
  },
  {
    id: "block-2",
    label: "Messages",
    query:
      "select * from public.cx_message where conversation_id = '{{:conversation_id}}'",
    status: "idle",
    result: null,
    error: null,
    executionTime: null,
    rowCount: null,
    resolvedQuery: null,
    ranAt: null,
  },
];

const SAMPLE_VARIABLES: Variable[] = [
  { id: "var-1", name: "conversation_id", value: "" },
];

function genId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 7)}`;
}

function coerceErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return "Unknown error";
  }
}

function loadPersisted(): WorkbenchPersistedState | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  return raw ? parseWorkbenchPersistedState(raw) : null;
}

function blocksFromPersisted(
  persisted: WorkbenchPersistedState["blocks"],
): QueryBlockState[] {
  return persisted.map((b) => ({
    id: b.id,
    label: b.label,
    query: b.query,
    status: "idle",
    result: null,
    error: null,
    executionTime: null,
    rowCount: null,
    resolvedQuery: null,
    ranAt: null,
  }));
}

export function useQueryWorkbench() {
  const [blocks, setBlocks] = useState<QueryBlockState[]>(SAMPLE_BLOCKS);
  const [variables, setVariables] = useState<Variable[]>(SAMPLE_VARIABLES);
  const [mergeConfig, setMergeConfig] =
    useState<MergeConfig>(DEFAULT_MERGE_CONFIG);
  const [mergeResult, setMergeResult] = useState<MergeResult | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const blocksRef = useRef(blocks);
  blocksRef.current = blocks;
  const variablesRef = useRef(variables);
  variablesRef.current = variables;

  useEffect(() => {
    const persisted = loadPersisted();
    if (persisted) {
      if (persisted.blocks.length > 0) {
        setBlocks(blocksFromPersisted(persisted.blocks));
      }
      if (Array.isArray(persisted.variables)) {
        setVariables(persisted.variables);
      }
      if (persisted.mergeConfig) {
        setMergeConfig({ ...DEFAULT_MERGE_CONFIG, ...persisted.mergeConfig });
      }
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    const payload: WorkbenchPersistedState = {
      blocks: blocks.map((b) => ({ id: b.id, label: b.label, query: b.query })),
      variables,
      mergeConfig,
    };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // ignore quota errors
    }
  }, [blocks, variables, mergeConfig, hydrated]);

  const updateBlock = (id: string, patch: Partial<QueryBlockState>) => {
    setBlocks((prev) =>
      prev.map((block) => (block.id === id ? { ...block, ...patch } : block)),
    );
  };

  const addBlock = () => {
    setBlocks((prev) => {
      const next: QueryBlockState = {
        id: genId("block"),
        label: `Query ${prev.length + 1}`,
        query: "",
        status: "idle",
        result: null,
        error: null,
        executionTime: null,
        rowCount: null,
        resolvedQuery: null,
        ranAt: null,
      };
      return [...prev, next];
    });
  };

  const removeBlock = (id: string) => {
    setBlocks((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((b) => b.id !== id);
    });
    setMergeConfig((prev) => ({
      ...prev,
      leftBlockId: prev.leftBlockId === id ? null : prev.leftBlockId,
      rightBlockId: prev.rightBlockId === id ? null : prev.rightBlockId,
    }));
  };

  const duplicateBlock = (id: string) => {
    setBlocks((prev) => {
      const idx = prev.findIndex((b) => b.id === id);
      if (idx === -1) return prev;
      const original = prev[idx];
      const copy: QueryBlockState = {
        ...original,
        id: genId("block"),
        label: `${original.label} (copy)`,
        status: "idle",
        result: null,
        error: null,
        executionTime: null,
        rowCount: null,
        resolvedQuery: null,
        ranAt: null,
      };
      const next = [...prev];
      next.splice(idx + 1, 0, copy);
      return next;
    });
  };

  const moveBlock = (id: string, direction: -1 | 1) => {
    setBlocks((prev) => {
      const idx = prev.findIndex((b) => b.id === id);
      if (idx === -1) return prev;
      const target = idx + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(idx, 1);
      next.splice(target, 0, item);
      return next;
    });
  };

  const runBlock = async (id: string) => {
    const target = blocksRef.current.find((b) => b.id === id);
    if (!target || !target.query.trim()) return;

    const { resolved, missing } = interpolateQuery(
      target.query,
      variablesRef.current,
    );

    if (missing.length > 0) {
      setBlocks((prev) =>
        prev.map((b) =>
          b.id === id
            ? {
                ...b,
                status: "error",
                error: `Missing variables: ${missing.join(", ")}`,
                result: null,
                executionTime: null,
                rowCount: null,
                resolvedQuery: resolved,
                ranAt: Date.now(),
              }
            : b,
        ),
      );
      return;
    }

    setBlocks((prev) =>
      prev.map((b) =>
        b.id === id
          ? {
              ...b,
              status: "running",
              error: null,
              result: null,
              executionTime: null,
              rowCount: null,
              resolvedQuery: resolved,
              ranAt: Date.now(),
            }
          : b,
      ),
    );

    const start = performance.now();
    try {
      const actionResult = await executeSqlQuery(resolved);
      const elapsed = performance.now() - start;

      if (actionResult.error) {
        setBlocks((prev) =>
          prev.map((b) =>
            b.id === id
              ? {
                  ...b,
                  status: "error",
                  error: actionResult.error,
                  result: null,
                  executionTime: elapsed,
                  rowCount: null,
                }
              : b,
          ),
        );
        return;
      }

      const payload = actionResult.data;
      const rows = toRows(payload);
      setBlocks((prev) =>
        prev.map((b) =>
          b.id === id
            ? {
                ...b,
                status: "success",
                result: payload,
                error: null,
                executionTime: elapsed,
                rowCount: rows.length,
              }
            : b,
        ),
      );
    } catch (err) {
      const elapsed = performance.now() - start;
      setBlocks((prev) =>
        prev.map((b) =>
          b.id === id
            ? {
                ...b,
                status: "error",
                error: coerceErrorMessage(err),
                result: null,
                executionTime: elapsed,
                rowCount: null,
              }
            : b,
        ),
      );
    }
  };

  const runAll = async () => {
    const targets = blocksRef.current
      .filter((b) => b.query.trim().length > 0)
      .map((b) => b.id);
    await Promise.all(targets.map((id) => runBlock(id)));
  };

  const clearResults = () => {
    setBlocks((prev) =>
      prev.map((b) => ({
        ...b,
        status: "idle",
        result: null,
        error: null,
        executionTime: null,
        rowCount: null,
        resolvedQuery: null,
        ranAt: null,
      })),
    );
    setMergeResult(null);
  };

  const addVariable = () => {
    setVariables((prev) => [
      ...prev,
      { id: genId("var"), name: "", value: "" },
    ]);
  };

  const updateVariable = (id: string, patch: Partial<Variable>) => {
    setVariables((prev) =>
      prev.map((v) => (v.id === id ? { ...v, ...patch } : v)),
    );
  };

  const removeVariable = (id: string) => {
    setVariables((prev) => prev.filter((v) => v.id !== id));
  };

  const setMergeField = <K extends keyof MergeConfig>(
    key: K,
    value: MergeConfig[K],
  ) => {
    setMergeConfig((prev) => ({ ...prev, [key]: value }));
  };

  let totalRows = 0;
  let totalMs = 0;
  let succeeded = 0;
  let failed = 0;
  let running = 0;
  for (const block of blocks) {
    if (typeof block.rowCount === "number") totalRows += block.rowCount;
    if (typeof block.executionTime === "number") totalMs += block.executionTime;
    if (block.status === "success") succeeded += 1;
    if (block.status === "error") failed += 1;
    if (block.status === "running") running += 1;
  }
  const totals = { totalRows, totalMs, succeeded, failed, running };

  return {
    blocks,
    variables,
    mergeConfig,
    mergeResult,
    setMergeResult,
    addBlock,
    updateBlock,
    removeBlock,
    duplicateBlock,
    moveBlock,
    runBlock,
    runAll,
    clearResults,
    addVariable,
    updateVariable,
    removeVariable,
    setMergeField,
    totals,
  };
}

export type UseQueryWorkbenchReturn = ReturnType<typeof useQueryWorkbench>;
