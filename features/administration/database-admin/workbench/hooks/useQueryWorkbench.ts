"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WorkbenchPersistedState;
    if (!parsed || !Array.isArray(parsed.blocks)) return null;
    return parsed;
  } catch {
    return null;
  }
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

  const updateBlock = useCallback(
    (id: string, patch: Partial<QueryBlockState>) => {
      setBlocks((prev) =>
        prev.map((b) => (b.id === id ? { ...b, ...patch } : b)),
      );
    },
    [],
  );

  const addBlock = useCallback(() => {
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
  }, []);

  const removeBlock = useCallback((id: string) => {
    setBlocks((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((b) => b.id !== id);
    });
    setMergeConfig((prev) => ({
      ...prev,
      leftBlockId: prev.leftBlockId === id ? null : prev.leftBlockId,
      rightBlockId: prev.rightBlockId === id ? null : prev.rightBlockId,
    }));
  }, []);

  const duplicateBlock = useCallback((id: string) => {
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
  }, []);

  const moveBlock = useCallback((id: string, direction: -1 | 1) => {
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
  }, []);

  const runBlock = useCallback(async (id: string) => {
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
  }, []);

  const runAll = useCallback(async () => {
    const targets = blocksRef.current
      .filter((b) => b.query.trim().length > 0)
      .map((b) => b.id);
    await Promise.all(targets.map((id) => runBlock(id)));
  }, [runBlock]);

  const clearResults = useCallback(() => {
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
  }, []);

  const addVariable = useCallback(() => {
    setVariables((prev) => [
      ...prev,
      { id: genId("var"), name: "", value: "" },
    ]);
  }, []);

  const updateVariable = useCallback((id: string, patch: Partial<Variable>) => {
    setVariables((prev) =>
      prev.map((v) => (v.id === id ? { ...v, ...patch } : v)),
    );
  }, []);

  const removeVariable = useCallback((id: string) => {
    setVariables((prev) => prev.filter((v) => v.id !== id));
  }, []);

  const setMergeField = useCallback(
    <K extends keyof MergeConfig>(key: K, value: MergeConfig[K]) => {
      setMergeConfig((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const totals = useMemo(() => {
    let totalRows = 0;
    let totalMs = 0;
    let succeeded = 0;
    let failed = 0;
    let running = 0;
    for (const b of blocks) {
      if (typeof b.rowCount === "number") totalRows += b.rowCount;
      if (typeof b.executionTime === "number") totalMs += b.executionTime;
      if (b.status === "success") succeeded += 1;
      if (b.status === "error") failed += 1;
      if (b.status === "running") running += 1;
    }
    return { totalRows, totalMs, succeeded, failed, running };
  }, [blocks]);

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
