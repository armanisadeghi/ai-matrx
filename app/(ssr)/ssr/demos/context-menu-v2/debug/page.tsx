"use client";

import { useEffect, useState } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { fetchUnifiedMenu } from "@/features/agents/redux/agent-shortcuts/thunks";
import { selectAllShortcutsArray } from "@/features/agents/redux/agent-shortcuts/selectors";
import { selectAllCategoriesArray } from "@/features/agents/redux/agent-shortcut-categories/selectors";
import { selectAllContentBlocksArray } from "@/features/agents/redux/agent-content-blocks/selectors";
import { extractErrorMessage } from "@/utils/errors";
import { JsonInspector } from "@/components/official-candidate/json-inspector/JsonInspector";

type DebugPayload = {
  counts: Record<string, number>;
  samples: Record<string, unknown>;
  view: { row_count: number; error: string | null; data: unknown };
  interpretation: string[];
};

export default function ContextMenuDebugPage() {
  const dispatch = useAppDispatch();
  const [debug, setDebug] = useState<DebugPayload | null>(null);
  const [debugError, setDebugError] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [fetched, setFetched] = useState(false);

  const shortcuts = useAppSelector(selectAllShortcutsArray);
  const categories = useAppSelector(selectAllCategoriesArray);
  const contentBlocks = useAppSelector(selectAllContentBlocksArray);

  useEffect(() => {
    fetch("/api/debug/agent-shortcuts", { credentials: "include" })
      .then((r) => r.json())
      .then((j) => {
        if (j.error) setDebugError(j.error);
        else setDebug(j);
      })
      .catch((e) => setDebugError(extractErrorMessage(e)));
  }, []);

  useEffect(() => {
    dispatch(fetchUnifiedMenu({ scope: "global" }))
      .unwrap()
      .then(() => setFetched(true))
      .catch((e) => setFetchError(extractErrorMessage(e)));
  }, [dispatch]);

  return (
    <div className="h-[calc(100vh-2.5rem)] flex flex-col overflow-hidden bg-textured">
      <div className="border-b border-border px-4 py-2">
        <h1 className="text-lg font-semibold">Agent Shortcuts — Diagnostic</h1>
        <p className="text-xs text-muted-foreground">
          Dev-only. Paste the output if the context menu shows disabled
          submenus.
        </p>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-6 text-xs font-mono">
        <section>
          <h2 className="font-semibold text-sm mb-2">
            DB state (/api/debug/agent-shortcuts)
          </h2>
          {debugError && <pre className="text-destructive">{debugError}</pre>}
          {!debug && !debugError && <p>loading…</p>}
          {debug && (
            <>
              <div className="bg-card border border-border rounded p-3 mb-2">
                <p className="font-semibold mb-1">Interpretation:</p>
                <ul className="list-disc ml-5">
                  {debug.interpretation.map((n, i) => (
                    <li key={i}>{n}</li>
                  ))}
                </ul>
              </div>

              <p className="font-semibold mb-1">Row counts:</p>
              <div className="bg-card border border-border rounded p-3 mb-2 grid grid-cols-2 gap-x-4 gap-y-1">
                {Object.entries(debug.counts).map(([key, count]) => (
                  <div
                    key={key}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="text-muted-foreground truncate">
                      {key}
                    </span>
                    <span className="font-semibold tabular-nums shrink-0">
                      {count}
                    </span>
                  </div>
                ))}
              </div>

              <p className="font-semibold mt-2 mb-1">
                View output ({debug.view.row_count} rows):
              </p>
              <div
                className="rounded border border-border overflow-hidden mb-2"
                style={{ height: 280 }}
              >
                <JsonInspector
                  data={debug.view.data}
                  label="view.data"
                  defaultView="tree"
                />
              </div>

              <p className="font-semibold mt-2 mb-1">Samples:</p>
              <div
                className="rounded border border-border overflow-hidden"
                style={{ height: 320 }}
              >
                <JsonInspector
                  data={debug.samples}
                  label="samples"
                  defaultView="tree"
                />
              </div>
            </>
          )}
        </section>

        <section>
          <h2 className="font-semibold text-sm mb-2">
            Redux state after fetchUnifiedMenu
          </h2>
          {fetchError && (
            <p className="text-destructive">thunk failed: {fetchError}</p>
          )}
          {!fetched && !fetchError && <p>fetching…</p>}
          {fetched && (
            <div className="bg-card border border-border rounded p-3">
              <p>
                categories in slice: <b>{categories.length}</b>
              </p>
              <p>
                shortcuts in slice: <b>{shortcuts.length}</b>
              </p>
              <p>
                content_blocks in slice: <b>{contentBlocks.length}</b>
              </p>
              {categories.length === 0 &&
                shortcuts.length === 0 &&
                contentBlocks.length === 0 && (
                  <p className="mt-2 text-amber-500">
                    All three slices are empty after fetch. Compare with DB
                    counts above — if DB has rows but Redux is empty, there's a
                    wiring bug. If DB is empty too, seed the tables.
                  </p>
                )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
