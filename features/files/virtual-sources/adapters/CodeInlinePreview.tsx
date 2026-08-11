/**
 * features/files/virtual-sources/adapters/CodeInlinePreview.tsx
 *
 * Inline preview for every code-shaped virtual source (Agent Apps, Prompt
 * Apps, Tool UIs, Code Snippets). Wraps the new `MonacoEditor` from the
 * `features/code` workspace — the same component the `/code` route uses
 * inside its editor tabs — and wires its `onChange` callback to the
 * source's adapter `write()` via the source-aware `writeAny` thunk
 * (debounced).
 *
 * The component is keyed on `(adapterId, id, fieldId?)` so multiple sources
 * can mount different bindings without colliding. Adapters re-export it as
 * their `inlinePreview` slot; PageShell and PreviewPane don't need to know
 * which source they're rendering.
 */

"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, Save } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppDispatch } from "@/lib/redux/hooks";
import { readAny, writeAny } from "@/features/files/redux/virtual-thunks";
import { makeSyntheticId } from "@/features/files/virtual-sources/path";
import type { InlinePreviewProps } from "@/features/files/virtual-sources/types";

const MonacoEditor = dynamic(
  () =>
    import("@/features/code/editor/MonacoEditor").then((m) => m.MonacoEditor),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center bg-muted/20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    ),
  },
);

const SAVE_DEBOUNCE_MS = 800;

interface Props extends InlinePreviewProps {
  /** Adapter source id — needed to build the synthetic id we pass to writeAny. */
  adapterId: string;
}

/**
 * Internal component. Adapters re-export a `makeCodeInlinePreview(adapterId)`
 * factory below that closes over their own source id, so consumers don't
 * have to pass it.
 */
function CodeInlinePreview({ adapterId, id, fieldId, name }: Props) {
  const dispatch = useAppDispatch();
  const [content, setContent] = useState<string>("");
  const [language, setLanguage] = useState<string>("plaintext");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  // The last-saved text drives the dirty indicator and the Save button, so it
  // is state — a ref mutation would leave both showing whatever they said at
  // the last unrelated render.
  const [lastSaved, setLastSaved] = useState<string>("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syntheticId = makeSyntheticId(adapterId, id, fieldId);
  const isDirty = content !== lastSaved;

  // Latest values for the unmount/target-change flush below, which runs after
  // the render that changed them. Written in an effect, never read in render.
  const latestRef = useRef({ content, lastSaved, error });
  useEffect(() => {
    latestRef.current = { content, lastSaved, error };
  });

  // Load on mount / target change. Routes through the source-aware `readAny`
  // thunk, which dispatches to the correct adapter under the hood.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const result = await dispatch(readAny({ id: syntheticId })).unwrap();
        if (cancelled) return;
        setContent(result.content);
        setLanguage(result.language || "plaintext");
        setLastSaved(result.content);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load file.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [dispatch, syntheticId]);

  const flushSave = useCallback(
    async (next: string) => {
      if (next === latestRef.current.lastSaved) return;
      setSaving(true);
      setSaveError(null);
      try {
        await dispatch(
          writeAny({ id: syntheticId, content: next }),
        ).unwrap();
        setLastSaved(next);
        setSavedAt(Date.now());
      } catch (err) {
        // Surface the error so the user sees that the save failed instead
        // of silently losing edits. Most likely cause: RLS rejection or a
        // missing column on the underlying row.
        setSaveError(
          err instanceof Error ? err.message : "Save failed.",
        );
      } finally {
        setSaving(false);
      }
    },
    [dispatch, syntheticId],
  );

  const handleChange = useCallback(
    (next: string) => {
      setContent(next);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        void flushSave(next);
      }, SAVE_DEBOUNCE_MS);
    },
    [flushSave],
  );

  // Cmd/Ctrl+S inside Monaco fires this — flush immediately, don't wait for
  // the debounce. The save chip in the header shows the pending state.
  const handleSaveShortcut = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    void flushSave(content);
  }, [content, flushSave]);

  // Best-effort flush on unmount — if the user closes the preview pane
  // mid-debounce we still try to land the save. Fire-and-forget; unmount
  // can't await.
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      // latestRef holds the values from the render before this cleanup, i.e.
      // the state of the target we are leaving.
      const { content: pending, lastSaved: saved, error: err } = latestRef.current;
      if (pending !== saved && !err) {
        void dispatch(writeAny({ id: syntheticId, content: pending }))
          .unwrap()
          .catch(() => undefined);
      }
    };
  }, [dispatch, syntheticId]);

  if (error) {
    return (
      <div className="flex h-full w-full items-center justify-center p-6 text-sm text-destructive">
        {error}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-muted/20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Recently saved indicator — fades after 2 seconds.
  const recentlySaved =
    savedAt !== null && Date.now() - savedAt < 2000 && !isDirty;

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-border/60 px-3 py-1.5 text-xs text-muted-foreground">
        <span className="truncate font-medium text-foreground">{name}</span>
        <div className="flex items-center gap-2">
          {saving ? (
            <span className="flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              Saving…
            </span>
          ) : recentlySaved ? (
            <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-3 w-3" />
              Saved
            </span>
          ) : isDirty ? (
            <span className="text-amber-600 dark:text-amber-400">
              Unsaved changes
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => void handleSaveShortcut()}
            disabled={!isDirty || saving}
            title="Save (⌘S / Ctrl+S)"
            className={cn(
              "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium",
              isDirty && !saving
                ? "border-primary/40 bg-primary text-primary-foreground hover:bg-primary/90"
                : "border-border/60 bg-muted/30 text-muted-foreground cursor-not-allowed",
            )}
          >
            <Save className="h-3 w-3" />
            Save
          </button>
        </div>
      </div>
      {saveError ? (
        <div className="border-b border-destructive/30 bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
          {saveError}
        </div>
      ) : null}
      <div className="min-h-0 flex-1">
        <MonacoEditor
          value={content}
          language={language}
          path={`vfs:${adapterId}/${id}${fieldId ? `:${fieldId}` : ""}`}
          onChange={handleChange}
          onSave={handleSaveShortcut}
        />
      </div>
    </div>
  );
}

/**
 * Build the adapter-specific `inlinePreview` component. Each adapter calls
 * this with its own `sourceId` and assigns the result to its
 * `inlinePreview` field. Closes over the source id so the inner component
 * doesn't have to be told which source it's previewing.
 */
export function makeCodeInlinePreview(adapterId: string) {
  function CodeInlinePreviewBound(props: InlinePreviewProps) {
    return <CodeInlinePreview adapterId={adapterId} {...props} />;
  }
  CodeInlinePreviewBound.displayName = `CodeInlinePreview(${adapterId})`;
  return CodeInlinePreviewBound;
}
