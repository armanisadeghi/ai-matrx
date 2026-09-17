// lib/detail/core/DetailPresentationPane.tsx
//
// "How record details open" — the ONE screen that WRITES
// `ui.detail.default_presentation`, and the per-record-type override beside
// it. It sits at the foot of every detail, quiet and collapsed, the way
// Notion carries "Open pages in" inside the peek itself rather than in a
// settings app three clicks away.
//
// 🚨 IT IS ALSO THE SURFACE THAT EXERCISES Cmd/Ctrl+Enter. The keyboard model
// has always offered `registerSave`, and until this pane existed NOTHING in
// the repo registered one, so the chord saved nothing anywhere (VERIFY-U-P1).
// No record type on this branch has an editable body, so the contract is held
// by the one editable thing a detail owns: this setting. The moment a record
// type ships an editor it registers its own save the same way and this pane
// stops being the only caller.

"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Settings2 } from "lucide-react";
import { cn } from "@ai-matrx/design-system";

import { useDetailHost } from "../host";
import { DETAIL_PRESENTATIONS, type DetailPresentation } from "../types";
import type { DetailCore } from "./useDetailCore";

const WORD: Record<DetailPresentation, string> = {
  window: "a window",
  docked: "a docked panel",
  page: "a full page",
};

const LABEL: Record<DetailPresentation, string> = {
  window: "Window",
  docked: "Docked",
  page: "Page",
};

type SaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "saved" }
  | { status: "refused"; reason: string };

export function DetailPresentationPane({ core }: { core: DetailCore }) {
  const host = useDetailHost();
  const save = host.savePresentation;
  const setting = host.usePresentationSetting(core.ref.type);
  const [choice, setChoice] = useState<DetailPresentation | null>(null);
  const [forThisType, setForThisType] = useState(false);
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<SaveState>({ status: "idle" });

  const effective = setting.value ?? core.presentation;
  const pending = choice ?? effective;
  const registerSave = core.keyboard.registerSave;

  const commit = async () => {
    if (!save) return;
    setState({ status: "saving" });
    const result = await save({
      presentation: pending,
      forType: forThisType ? core.ref.type : null,
    });
    if (result.ok) {
      setState({ status: "saved" });
      host.notify.success(
        forThisType
          ? `Every ${core.typeLabel.toLowerCase()} now opens as ${WORD[pending]} for you.`
          : `Record details now open as ${WORD[pending]} for you.`,
      );
    } else {
      setState({ status: "refused", reason: result.reason });
    }
  };

  // Cmd/Ctrl+Enter saves whatever is pending here, from anywhere in the detail.
  // The registration is a stable function reading the LATEST commit through a
  // ref (the same shape `useDetailKeyboard` uses for its handlers), so moving
  // the choice does not re-register, and the chord is registered only while
  // this pane is open — a record type's own editor always wins when one exists.
  const commitRef = useRef(commit);
  commitRef.current = commit;
  useEffect(() => {
    if (!open || !save) return undefined;
    return registerSave(() => commitRef.current());
  }, [open, save, registerSave]);

  // The host has no writable setting bound (a client that reads the platform
  // setting but cannot write it). Absent, never a disabled-looking control.
  if (!save) return null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-1.5 rounded-md px-1 py-1 text-left text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        data-detail-presentation-pane="collapsed"
      >
        <Settings2 className="h-3 w-3 shrink-0" />
        <span>
          {setting.error
            ? `Your "open details as" setting could not be read (${setting.error}) — details are opening as ${WORD[core.presentation]}.`
            : `Details open as ${WORD[effective]}.`}
        </span>
        <span className="underline underline-offset-2">Change</span>
      </button>
    );
  }

  return (
    <section
      className="space-y-2 rounded-md border border-border bg-muted/30 p-3"
      data-detail-presentation-pane="open"
    >
      <h3 className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <Settings2 className="h-3 w-3" />
        How record details open
      </h3>
      <div className="flex flex-wrap gap-1" role="group" aria-label="Open record details as">
        {DETAIL_PRESENTATIONS.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={pending === value}
            onClick={() => {
              setChoice(value);
              setState({ status: "idle" });
            }}
            className={cn(
              "rounded-md px-2 py-1 text-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:py-2",
              pending === value
                ? "bg-primary text-primary-foreground"
                : "bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {LABEL[value]}
          </button>
        ))}
      </div>
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={forThisType}
          onChange={(event) => {
            setForThisType(event.target.checked);
            setState({ status: "idle" });
          }}
          className="h-3.5 w-3.5 accent-[var(--color-primary)]"
        />
        Only for {core.typeLabel.toLowerCase()} records
      </label>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void commit()}
          disabled={state.status === "saving"}
          className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60 pointer-coarse:py-2"
        >
          {state.status === "saving" ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : state.status === "saved" ? (
            <Check className="h-3 w-3" />
          ) : null}
          Save
        </button>
        <span className="text-[11px] text-muted-foreground">
          {state.status === "saved" ? "Saved. It applies to the next record you open." : "⌘/Ctrl + Enter"}
        </span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="ml-auto text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          Close
        </button>
      </div>
      {state.status === "refused" ? (
        <p className="text-xs text-destructive" data-detail-presentation-refusal>
          {state.reason}
        </p>
      ) : null}
      {setting.error ? (
        <p className="text-xs text-muted-foreground">
          The saved setting could not be read here ({setting.error}), so this shows what this detail
          is actually doing.
        </p>
      ) : null}
    </section>
  );
}
