"use client";

/**
 * THE SYSTEM ITEMS EVERY AGENT RECEIVES WITHOUT NAMING THEM — the platform knob
 * `context/system_item_defaults` (lane CONTEXT-VALUES-NAMED-2, chair ruling a).
 *
 * A System context item reaches an agent only when something names it: the agent's own variable
 * or context slot bound to it, a pick in the context inspector, or this list. Both context
 * resolvers read only the named items, so an item off this list is never read for an agent that
 * does not name it. Default: today's date, the current date and time, and the person's timezone.
 *
 * Reads the knob row and the System items (the super-admin System context route); writes through
 * `platform.feature_knob_set` (admin only, the one knob write path). A key on the list that is
 * not a System item says so on its chip; nothing is dropped in silence.
 */

import { useEffect, useState } from "react";
import { Plus, RotateCcw, X } from "lucide-react";

import { Button, Input } from "@ai-matrx/design-system";
import { toast } from "@/lib/toast";
import { createClient } from "@/utils/supabase/client";
import { setFeatureKnob } from "@/features/admin/limits/service";
import type { FeatureKnobSetResult } from "@/features/admin/limits/types";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

export const SYSTEM_ITEM_DEFAULTS_KNOB = { feature: "context", key: "system_item_defaults" } as const;

/** The one honest sentence the page says about this list. */
export const SYSTEM_ITEM_DEFAULTS_SENTENCE = "Every agent receives these without naming them.";

export interface SystemItemOption {
  key: string;
  display_name: string;
}

export interface SystemItemDefaultsData {
  value: string[];
  defaultValue: string[];
  items: SystemItemOption[];
}

function keysOf(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  return raw.filter((k): k is string => typeof k === "string");
}

export async function loadSystemItemDefaults(): Promise<SystemItemDefaultsData> {
  const supabase = createClient();
  const [{ data: knob, error }, itemsResponse] = await Promise.all([
    supabase
      .schema("platform")
      .from("feature_knob")
      .select("value, default_value")
      .eq("feature", SYSTEM_ITEM_DEFAULTS_KNOB.feature)
      .eq("key", SYSTEM_ITEM_DEFAULTS_KNOB.key)
      .is("archived_at", null)
      .maybeSingle(),
    fetch("/api/admin/system-context"),
  ]);
  if (error) throw new Error(error.message);
  if (!knob) throw new Error("the platform knob context/system_item_defaults does not exist");
  const value = keysOf(knob.value);
  const defaultValue = keysOf(knob.default_value);
  if (!value || !defaultValue) throw new Error("the knob does not hold a list of System item keys");
  if (!itemsResponse.ok) {
    const body = (await itemsResponse.json().catch(() => ({}))) as { error?: string };
    throw new Error(`the System items could not be read: ${body.error ?? itemsResponse.statusText}`);
  }
  const payload = (await itemsResponse.json()) as { items?: SystemItemOption[] };
  const items = (payload.items ?? []).map((i) => ({ key: i.key, display_name: i.display_name }));
  return { value, defaultValue, items };
}

export function saveSystemItemDefaults(keys: string[] | null): Promise<FeatureKnobSetResult> {
  return setFeatureKnob(SYSTEM_ITEM_DEFAULTS_KNOB.feature, SYSTEM_ITEM_DEFAULTS_KNOB.key, keys);
}

type State =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "ready"; data: SystemItemDefaultsData };

const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((k, i) => k === b[i]);

export function SystemItemDefaultsEditor({
  load = loadSystemItemDefaults,
  save = saveSystemItemDefaults,
}: {
  load?: () => Promise<SystemItemDefaultsData>;
  save?: (keys: string[] | null) => Promise<FeatureKnobSetResult>;
}) {
  const [state, setState] = useState<State>({ phase: "loading" });
  const [draft, setDraft] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let live = true;
    load()
      .then((data) => {
        if (!live) return;
        setState({ phase: "ready", data });
        setDraft(data.value);
      })
      .catch((e: unknown) => {
        if (live) setState({ phase: "error", message: e instanceof Error ? e.message : String(e) });
      });
    return () => {
      live = false;
    };
  }, [load]);

  const items = state.phase === "ready" ? state.data.items : [];
  const byKey = new Map(items.map((i) => [i.key, i]));
  const q = query.trim().toLowerCase();
  const candidates = items
    .filter((i) => !draft.includes(i.key))
    .filter((i) => !q || i.key.toLowerCase().includes(q) || i.display_name.toLowerCase().includes(q))
    .slice(0, 12);

  if (state.phase === "loading") {
    return (
      <div className="rounded-lg border border-border bg-card px-4 py-3">
        <p className="text-sm text-muted-foreground">Reading the System items every agent receives…</p>
      </div>
    );
  }
  if (state.phase === "error") {
    return (
      <div className="rounded-lg border border-border bg-card px-4 py-3">
        <p className="text-sm text-destructive">
          The System items every agent receives could not be read: {state.message}
          <ErrorAlchemyMenu />
        </p>
      </div>
    );
  }

  const { data } = state;
  const dirty = !sameList(draft, data.value);
  const isDefault = sameList(draft, data.defaultValue);

  async function commit(keys: string[] | null) {
    setSaving(true);
    try {
      const result = await save(keys);
      if (!result.ok) {
        toast.error(`Not saved: ${result.detail ?? result.reason}`);
        return;
      }
      const next = keys ?? data.defaultValue;
      setState({ phase: "ready", data: { ...data, value: next } });
      setDraft(next);
      toast.success("Saved. Every agent's next turn receives this list.");
    } catch (e: unknown) {
      toast.error(`Not saved: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      className="space-y-2 rounded-lg border border-border bg-card px-4 py-3"
      aria-label="System items every agent receives"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">System items every agent receives</h2>
          <p className="text-sm text-muted-foreground">
            {SYSTEM_ITEM_DEFAULTS_SENTENCE} Any other System item reaches an agent only when the agent names it.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!isDefault && (
            <Button
              variant="ghost"
              size="sm"
              disabled={saving}
              onClick={() => void commit(null)}
              title={`Back to the platform default: ${data.defaultValue.join(", ")}`}
            >
              <RotateCcw className="mr-1 h-3.5 w-3.5" aria-hidden />
              Use the default
            </Button>
          )}
          {dirty && (
            <>
              <Button variant="ghost" size="sm" disabled={saving} onClick={() => setDraft(data.value)}>
                Discard
              </Button>
              <Button size="sm" disabled={saving} onClick={() => void commit(draft)}>
                {saving ? "Saving…" : "Save"}
              </Button>
            </>
          )}
        </div>
      </div>

      <ul className="flex flex-wrap gap-1.5" aria-label="On the list">
        {draft.length === 0 && (
          <li className="text-sm text-muted-foreground">
            Nothing — no agent receives a System item it does not name.
          </li>
        )}
        {draft.map((key) => {
          const item = byKey.get(key);
          return (
            <li
              key={key}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-muted px-2 py-0.5 text-sm"
            >
              <span className="font-mono text-xs">{key}</span>
              {item ? (
                <span className="text-muted-foreground">{item.display_name}</span>
              ) : (
                <span className="text-amber-600 dark:text-amber-400">not a System item — nothing is delivered for it</span>
              )}
              <button
                type="button"
                className="ml-0.5 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label={`Take ${key} off the list`}
                disabled={saving}
                onClick={() => setDraft(draft.filter((k) => k !== key))}
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap items-center gap-1.5">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a System item to add"
          aria-label="Find a System item to add"
          className="h-8 w-56 text-base md:text-sm"
        />
        {candidates.map((i) => (
          <Button
            key={i.key}
            variant="outline"
            size="sm"
            className="h-7"
            disabled={saving}
            onClick={() => setDraft([...draft, i.key])}
            aria-label={`Add ${i.key}`}
          >
            <Plus className="mr-1 h-3 w-3" aria-hidden />
            {i.key}
          </Button>
        ))}
        {candidates.length === 0 && (
          <span className="text-sm text-muted-foreground">
            {query ? "No System item matches." : "Every System item is on the list."}
          </span>
        )}
      </div>
    </section>
  );
}
