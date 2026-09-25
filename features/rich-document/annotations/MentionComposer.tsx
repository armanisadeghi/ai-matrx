// features/rich-document/annotations/MentionComposer.tsx
//
// The comment composer: a plain textarea that understands `@`. Typing
// `@query` opens one list mixing people who can read the source
// (cmt_mention_candidates), records (the RC-B8 wikilink candidate search) and
// a date parsed from the query. Picking one inserts the stored token
// (mentions.ts). Enter posts, Shift+Enter is a new line, Escape closes the
// list, then cancels. The draft is kept on a failed post.

"use client";

import { useEffect, useRef, useState } from "react";
import { AtSign, CalendarDays, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { searchCandidatesAcrossTokens } from "@/features/scopes/service/associationCandidates";
import { tryGetEntityInfo } from "@/features/scopes/registry/entityRegistry";
import { dateMention, parseDateQuery, personMention, recordMention } from "./mentions";
import { mentionCandidates } from "./service";
import type { AnnotationSource } from "./types";

type Option =
  | { kind: "person"; key: string; label: string; detail: string | null; insert: string }
  | { kind: "record"; key: string; label: string; detail: string; insert: string }
  | { kind: "date"; key: string; label: string; detail: string; insert: string };

const MENTION_QUERY = /(^|\s)@([^\s@]{0,40}(?: [^\s@]{1,20})?)$/;

export interface MentionComposerProps {
  source: AnnotationSource;
  onSubmit: (text: string, secondary?: string) => Promise<void> | void;
  onCancel?: () => void;
  placeholder?: string;
  submitLabel?: string;
  initialValue?: string;
  autoFocus?: boolean;
  /** People mentions need the RC-B11 doors; records and dates never do. */
  mentions?: boolean;
  /** A second, optional field (a suggestion's reason). */
  secondary?: { placeholder: string };
  className?: string;
}

export function MentionComposer({
  source,
  onSubmit,
  onCancel,
  placeholder,
  submitLabel = "Comment",
  initialValue = "",
  autoFocus,
  mentions = true,
  secondary,
  className,
}: MentionComposerProps) {
  const [value, setValue] = useState(initialValue);
  const [second, setSecond] = useState("");
  const [query, setQuery] = useState<string | null>(null);
  const [options, setOptions] = useState<Option[]>([]);
  const [searching, setSearching] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    if (query == null) {
      setOptions([]);
      return;
    }
    let stale = false;
    const handle = setTimeout(async () => {
      setSearching(true);
      const next: Option[] = [];
      const date = parseDateQuery(query);
      if (date) {
        const token = dateMention(date);
        next.push({ kind: "date", key: `date:${token}`, label: token.slice(2, token.indexOf("]")), detail: "Date", insert: token });
      }
      const [people, records] = await Promise.all([
        mentions ? mentionCandidates(source, query).catch(() => []) : Promise.resolve([]),
        query.length >= 2
          ? searchCandidatesAcrossTokens({ search: query, perTokenLimit: 3 }).catch(() => [])
          : Promise.resolve([]),
      ]);
      for (const p of people) {
        next.push({ kind: "person", key: `user:${p.userId}`, label: p.name, detail: p.email, insert: personMention(p.name, p.userId) });
      }
      for (const r of records.slice(0, 8)) {
        const info = tryGetEntityInfo(r.token);
        next.push({ kind: "record", key: `${r.token}:${r.id}`, label: r.title || "Untitled", detail: info?.label ?? r.token, insert: recordMention(r.token, r.id, r.title || "Untitled") });
      }
      if (!stale) {
        setOptions(next);
        setCursor(0);
        setSearching(false);
      }
    }, 150);
    return () => {
      stale = true;
      clearTimeout(handle);
    };
  }, [query, mentions, source]);

  const onChange = (text: string) => {
    setValue(text);
    const el = ref.current;
    const upto = text.slice(0, el?.selectionStart ?? text.length);
    const m = MENTION_QUERY.exec(upto);
    setQuery(m ? m[2] : null);
  };

  const pick = (opt: Option) => {
    const el = ref.current;
    const caret = el?.selectionStart ?? value.length;
    const upto = value.slice(0, caret);
    const m = MENTION_QUERY.exec(upto);
    if (!m) return;
    const start = caret - m[2].length - 1;
    const next = `${value.slice(0, start)}${opt.insert} ${value.slice(caret)}`;
    setValue(next);
    setQuery(null);
    requestAnimationFrame(() => {
      const pos = start + opt.insert.length + 1;
      el?.focus();
      el?.setSelectionRange(pos, pos);
    });
  };

  const submit = async () => {
    const text = value.trim();
    if (!text || posting) return;
    setPosting(true);
    setError(null);
    try {
      await onSubmit(text, secondary ? second.trim() : undefined);
      setValue("");
      setSecond("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className={cn("relative grid gap-1.5", className)}>
      <textarea
        ref={ref}
        value={value}
        aria-label={placeholder ?? "Comment"}
        placeholder={placeholder}
        rows={2}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (query != null && options.length) {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setCursor((c) => (c + 1) % options.length);
              return;
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setCursor((c) => (c - 1 + options.length) % options.length);
              return;
            }
            if (e.key === "Enter" || e.key === "Tab") {
              e.preventDefault();
              pick(options[cursor]);
              return;
            }
          }
          if (e.key === "Escape") {
            e.stopPropagation();
            if (query != null) setQuery(null);
            else onCancel?.();
            return;
          }
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void submit();
          }
        }}
        className="min-h-16 w-full resize-y rounded-md border border-input bg-background px-2 py-1.5 text-base md:text-sm"
      />
      {query != null && (
        <div role="listbox" aria-label="Mention" className="absolute left-0 right-0 top-full z-10 mt-1 max-h-60 overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-lg">
          {searching && options.length === 0 ? (
            <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              Searching
            </div>
          ) : options.length === 0 ? (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">
              {mentions ? "No person, record or date matches." : "No record or date matches. Mentioning people switches on with the comment update."}
            </p>
          ) : (
            options.map((opt, i) => (
              <button
                key={opt.key}
                type="button"
                role="option"
                aria-selected={i === cursor}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(opt)}
                className={cn("flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm", i === cursor ? "bg-accent" : "hover:bg-accent/60")}
              >
                {opt.kind === "person" ? <AtSign className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden /> : opt.kind === "date" ? <CalendarDays className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden /> : <FileText className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />}
                <span className="min-w-0 flex-1 truncate">{opt.label}</span>
                {opt.detail && <span className="shrink-0 text-xs text-muted-foreground">{opt.detail}</span>}
              </button>
            ))
          )}
        </div>
      )}
      {secondary && (
        <input
          value={second}
          onChange={(e) => setSecond(e.target.value)}
          placeholder={secondary.placeholder}
          aria-label={secondary.placeholder}
          className="w-full rounded-md border border-input bg-background px-2 py-1 text-base md:text-sm"
        />
      )}
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      <div className="flex justify-end gap-1">
        {onCancel && (
          <Button size="sm" variant="ghost" onClick={onCancel} disabled={posting}>
            Cancel
          </Button>
        )}
        <Button size="sm" onClick={() => void submit()} disabled={posting || !value.trim()}>
          {posting ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}
