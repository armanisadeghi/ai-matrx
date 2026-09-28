"use client";

/**
 * The Voice page — how one brand or one person writes, measured from their real
 * writing and confirmed by them (brand voice: outside-skill-packs spec T1 + Brief 8).
 *
 * 1. Pick 5–20 samples from Sources.
 * 2. Measure → the triage (sample count, words, AI-edited share, register split,
 *    confidence) and an unconfirmed fingerprint.
 * 3. Confirm the high-risk fields (em dash, openers, closers, signature phrases,
 *    globally banned words they really use, register) → the fingerprint drives
 *    every drafting job's voice check; a brand's voice line becomes its summary.
 * 4. Try a draft → the same enforce loop the drafting jobs run ("Fix voice").
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Loader2, Search, ShieldAlert, Wand2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@ai-matrx/design-system";
import { Textarea } from "@/components/ui/textarea";
import { sourceHref } from "@/features/sources/api/sourcesApi";

import {
  MAX_SAMPLES,
  MIN_SAMPLES,
  SAMPLE_KINDS,
  confirmVoice,
  fixVoice,
  listFingerprints,
  measureVoice,
  refreshLabel,
  searchSources,
  type ConfirmedVoice,
  type FingerprintRow,
  type SourceOption,
  type VoiceMeasureResult,
  type VoiceProfileScope,
  type VoiceSampleKind,
  type VoiceSurface,
  type VoiceTextOutcome,
} from "./service";

export interface VoicePageProps {
  scope: VoiceProfileScope;
  /** The brand id, or the person's own user id. */
  ownerId: string;
  ownerName: string;
  /** The organization the fingerprint is filed in; a person page resolves it on first action. */
  organizationId: string | null;
  resolveOrganization?: () => Promise<string>;
}

type Picked = { source: SourceOption; kind: VoiceSampleKind };

const REGISTERS = ["formal", "professional", "casual-professional", "casual", "irreverent"] as const;
const EM_DASH = ["never", "rare", "habitual"] as const;
const SURFACES: readonly VoiceSurface[] = ["pitch", "reactive", "social", "newsletter"];

type Fp = {
  mechanics?: { em_dash_usage?: (typeof EM_DASH)[number] };
  openers?: { observed?: string[] };
  closers?: { observed?: string[] };
  idioms?: { signature_phrases?: string[]; signature_words?: string[] };
  global_words_in_samples?: string[];
  banned_words_global_allowed?: string[];
  register_label?: (typeof REGISTERS)[number];
};

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function toggle(list: string[], item: string): string[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

const selectClass =
  "h-8 rounded-md border border-border bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

export function VoicePage({ scope, ownerId, ownerName, organizationId, resolveOrganization }: VoicePageProps) {
  const [rows, setRows] = useState<FingerprintRow[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const [query, setQuery] = useState("");
  const [sources, setSources] = useState<SourceOption[] | null>(null);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [picked, setPicked] = useState<Picked[]>([]);

  const [measuring, setMeasuring] = useState(false);
  const [measured, setMeasured] = useState<VoiceMeasureResult | null>(null);
  const [measureError, setMeasureError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listFingerprints(scope, ownerId)
      .then((data) => {
        if (!cancelled) {
          setRows(data);
          setListError(null);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) setListError(errorText(error));
      });
    return () => {
      cancelled = true;
    };
  }, [scope, ownerId, nonce]);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      searchSources(query)
        .then((data) => {
          if (!cancelled) {
            setSources(data);
            setSourceError(null);
          }
        })
        .catch((error: unknown) => {
          if (!cancelled) setSourceError(errorText(error));
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  const org = async (): Promise<string> => {
    if (organizationId) return organizationId;
    if (resolveOrganization) return resolveOrganization();
    throw new Error("Pick an organization to file this voice in.");
  };

  const current = rows?.[0] ?? null;
  const toConfirm = rows?.find((r) => r.status === "draft") ?? null;

  const measure = async () => {
    setMeasuring(true);
    setMeasureError(null);
    try {
      const result = await measureVoice(
        await org(),
        scope,
        ownerId,
        picked.map((p) => ({ source_id: p.source.id, source: p.kind })),
      );
      setMeasured(result);
      setNonce((n) => n + 1);
    } catch (error) {
      setMeasureError(errorText(error));
    } finally {
      setMeasuring(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-textured">
      <div className="mx-auto w-full max-w-4xl space-y-4 px-3 pb-10 pt-[calc(var(--shell-header-h)+1rem)] sm:px-4">
        <header>
          <h1 className="text-base font-semibold text-foreground">{ownerName} · Voice</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            How {scope === "brand" ? "this brand" : "you"} actually write, measured from real writing. Every pitch,
            reply, subject line and statement written in {scope === "brand" ? "its" : "your"} name is checked against it,
            and the AI tells are rewritten before you see the draft.
          </p>
        </header>

        <Card className="p-4" data-testid="voice-current">
          <h2 className="text-sm font-medium text-foreground">Current voice</h2>
          {listError ? (
            <p className="mt-2 text-sm text-destructive">{listError}</p>
          ) : rows === null ? (
            <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Reading saved voices
            </p>
          ) : current === null ? (
            <p className="mt-2 text-sm text-muted-foreground">
              No voice measured yet. Pick {MIN_SAMPLES} to {MAX_SAMPLES} samples below; drafts are not voice-checked until one
              is confirmed.
            </p>
          ) : (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <Badge variant={current.status === "confirmed" ? "default" : "secondary"}>
                {current.status === "confirmed" ? "Confirmed" : "Needs your confirmation"}
              </Badge>
              <span className="text-muted-foreground">Confidence {current.confidence}</span>
              <span className="text-muted-foreground">
                {current.sample_count} samples · {current.sample_word_count.toLocaleString()} words
              </span>
              <span className="text-muted-foreground">
                Measured {new Date(current.last_extracted_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </span>
              <span className="text-muted-foreground" data-testid="voice-refresh">
                {refreshLabel(current.refresh_due_at)}
              </span>
            </div>
          )}
        </Card>

        <Card className="p-4">
          <h2 className="text-sm font-medium text-foreground">Samples from Sources</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Pick {MIN_SAMPLES} to {MAX_SAMPLES} pieces {scope === "brand" ? "the brand really published" : "you really wrote"}.
            Short, recent, unedited writing (emails, posts, Slack) measures best; a brand&apos;s website copy and a
            spokesperson&apos;s pitch voice are separate voices.
          </p>
          <div className="relative mt-3">
            <Search className="pointer-events-none absolute left-2 top-2 h-4 w-4 text-muted-foreground" aria-hidden />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search your Sources by name"
              className="pl-8"
              aria-label="Search Sources"
            />
          </div>
          {sourceError ? <p className="mt-2 text-sm text-destructive">{sourceError}</p> : null}
          <ul className="mt-2 max-h-64 divide-y divide-border overflow-y-auto rounded-md border border-border" data-testid="voice-sources">
            {sources === null ? (
              <li className="flex items-center gap-2 p-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Listing Sources
              </li>
            ) : sources.length === 0 ? (
              <li className="p-2 text-sm text-muted-foreground">No Sources match. Add writing to Knowledge first.</li>
            ) : (
              sources.map((source) => {
                const chosen = picked.find((p) => p.source.id === source.id);
                return (
                  <li key={source.id} className="flex items-center gap-2 p-2 text-sm">
                    <input
                      type="checkbox"
                      aria-label={`Use ${source.name}`}
                      checked={Boolean(chosen)}
                      onChange={() =>
                        setPicked((list) =>
                          chosen
                            ? list.filter((p) => p.source.id !== source.id)
                            : list.length >= MAX_SAMPLES
                              ? list
                              : [...list, { source, kind: "other" }],
                        )
                      }
                    />
                    <Link href={sourceHref(source.id)} className="min-w-0 flex-1 truncate hover:underline" target="_blank">
                      {source.name}
                    </Link>
                    {chosen ? (
                      <select
                        aria-label={`Kind of ${source.name}`}
                        className={selectClass}
                        value={chosen.kind}
                        onChange={(e) =>
                          setPicked((list) =>
                            list.map((p) =>
                              p.source.id === source.id ? { ...p, kind: e.target.value as VoiceSampleKind } : p,
                            ),
                          )
                        }
                      >
                        {SAMPLE_KINDS.map((k) => (
                          <option key={k} value={k}>
                            {k}
                          </option>
                        ))}
                      </select>
                    ) : null}
                  </li>
                );
              })
            )}
          </ul>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button onClick={measure} disabled={measuring || picked.length < MIN_SAMPLES}>
              {measuring ? <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden /> : null}
              Measure voice
            </Button>
            <span className="text-xs text-muted-foreground" data-testid="voice-picked">
              {picked.length} of {MIN_SAMPLES}–{MAX_SAMPLES} picked
              {picked.length < MIN_SAMPLES ? ` — pick ${MIN_SAMPLES - picked.length} more to measure` : ""}
              {picked.length >= MAX_SAMPLES ? " — that is the most one voice uses" : ""}
            </span>
          </div>
          {measureError ? <p className="mt-2 text-sm text-destructive">{measureError}</p> : null}
          {measured?.triage ? <Triage result={measured} /> : null}
        </Card>

        {toConfirm ? (
          <ConfirmCard
            key={toConfirm.id}
            row={toConfirm}
            scope={scope}
            org={org}
            onSaved={() => setNonce((n) => n + 1)}
          />
        ) : null}

        {current?.status === "confirmed" ? <TryDraft fingerprintId={current.id} org={org} /> : null}
      </div>
    </div>
  );
}

function Triage({ result }: { result: VoiceMeasureResult }) {
  const t = result.triage!;
  const ai = Math.round((t.ai_tell_share ?? 0) * 100);
  return (
    <div className="mt-3 rounded-md border border-border p-3 text-sm" data-testid="voice-triage">
      <h3 className="font-medium text-foreground">What the samples show</h3>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-5">
        <div>
          <dt className="text-xs text-muted-foreground">Samples</dt>
          <dd>{t.sample_count}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Words</dt>
          <dd>{(t.total_words ?? 0).toLocaleString()}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">AI-edited share</dt>
          <dd>{ai}%</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Register</dt>
          <dd>{t.register_split ? "Split in two" : "One register"}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Confidence</dt>
          <dd>{t.confidence}</dd>
        </div>
      </dl>
      {(t.warnings ?? []).length > 0 ? (
        <ul className="mt-2 space-y-1">
          {(t.warnings ?? []).map((w) => (
            <li key={w} className="flex gap-2 text-xs text-amber-700 dark:text-amber-400">
              <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> {w}
            </li>
          ))}
        </ul>
      ) : null}
      {result.fingerprint_id ? null : (
        <p className="mt-2 text-xs text-muted-foreground">Nothing was saved: this is too little writing to measure a voice.</p>
      )}
    </div>
  );
}

function CheckList({
  label,
  items,
  kept,
  onToggle,
  empty,
}: {
  label: string;
  items: string[];
  kept: string[];
  onToggle: (item: string) => void;
  empty: string;
}) {
  return (
    <fieldset className="text-sm">
      <legend className="font-medium text-foreground">{label}</legend>
      {items.length === 0 ? (
        <p className="mt-1 text-xs text-muted-foreground">{empty}</p>
      ) : (
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
          {items.map((item) => (
            <label key={item} className="flex items-center gap-1.5">
              <input type="checkbox" checked={kept.includes(item)} onChange={() => onToggle(item)} />
              {item}
            </label>
          ))}
        </div>
      )}
    </fieldset>
  );
}

function ConfirmCard({
  row,
  scope,
  org,
  onSaved,
}: {
  row: FingerprintRow;
  scope: VoiceProfileScope;
  org: () => Promise<string>;
  onSaved: () => void;
}) {
  const fp = row.fingerprint as Fp;
  const openers = fp.openers?.observed ?? [];
  const closers = fp.closers?.observed ?? [];
  const signature = [...(fp.idioms?.signature_phrases ?? []), ...(fp.idioms?.signature_words ?? [])];
  const globals = fp.global_words_in_samples ?? [];

  const [emDash, setEmDash] = useState<(typeof EM_DASH)[number]>(fp.mechanics?.em_dash_usage ?? "rare");
  const [keptOpeners, setKeptOpeners] = useState<string[]>(openers);
  const [keptClosers, setKeptClosers] = useState<string[]>(closers);
  const [keptSignature, setKeptSignature] = useState<string[]>([]);
  const [allowed, setAllowed] = useState<string[]>(fp.banned_words_global_allowed ?? []);
  const [register, setRegister] = useState<(typeof REGISTERS)[number]>(fp.register_label ?? "professional");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<ConfirmedVoice | null>(null);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const result = await confirmVoice(await org(), row.id, {
        em_dash_usage: emDash,
        openers: keptOpeners,
        closers: keptClosers,
        signature_phrases: keptSignature,
        banned_words_allowed: allowed,
        register_label: register,
      });
      setSaved(result);
      onSaved();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="space-y-3 p-4" data-testid="voice-confirm">
      <div>
        <h2 className="text-sm font-medium text-foreground">Confirm before it is used</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          These are the fields that make drafts sound AI-written when they are wrong. Nothing checks drafts against
          this voice until you save.
        </p>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <span className="font-medium text-foreground">Em dashes</span>
        <select aria-label="Em dashes" className={selectClass} value={emDash} onChange={(e) => setEmDash(e.target.value as typeof emDash)}>
          {EM_DASH.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
        {emDash !== "never" && fp.mechanics?.em_dash_usage === "never" ? (
          <span className="text-xs text-amber-700 dark:text-amber-400">
            The samples never use one; allowing them is the most common way a draft reads as AI.
          </span>
        ) : null}
      </label>
      <CheckList
        label="Openers you use"
        items={openers}
        kept={keptOpeners}
        onToggle={(i) => setKeptOpeners((l) => toggle(l, i))}
        empty="No repeated openers found."
      />
      <CheckList
        label="Closers you use"
        items={closers}
        kept={keptClosers}
        onToggle={(i) => setKeptClosers((l) => toggle(l, i))}
        empty="No repeated closers found."
      />
      <CheckList
        label="Signature phrases that really are yours"
        items={signature}
        kept={keptSignature}
        onToggle={(i) => setKeptSignature((l) => toggle(l, i))}
        empty="No signature phrases stood out."
      />
      <CheckList
        label="Words on the banned list you genuinely use"
        items={globals}
        kept={allowed}
        onToggle={(i) => setAllowed((l) => toggle(l, i))}
        empty="None of the globally banned words appear in the samples."
      />
      <label className="flex items-center gap-2 text-sm">
        <span className="font-medium text-foreground">Register</span>
        <select aria-label="Register" className={selectClass} value={register} onChange={(e) => setRegister(e.target.value as typeof register)}>
          {REGISTERS.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden /> : <Check className="mr-1 h-4 w-4" aria-hidden />}
          Save voice
        </Button>
        {error ? <span className="text-sm text-destructive">{error}</span> : null}
      </div>
      {saved ? (
        <p className="text-sm text-foreground" data-testid="voice-saved">
          Saved. {scope === "brand" ? "The brand's voice line now reads: " : "Summary: "}
          <span className="text-muted-foreground">{saved.summary_line}</span>
        </p>
      ) : null}
    </Card>
  );
}

function TryDraft({ fingerprintId, org }: { fingerprintId: string; org: () => Promise<string> }) {
  const [draft, setDraft] = useState("");
  const [surface, setSurface] = useState<VoiceSurface>("pitch");
  const [running, setRunning] = useState(false);
  const [outcome, setOutcome] = useState<VoiceTextOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setRunning(true);
    setError(null);
    setOutcome(null);
    try {
      setOutcome(await fixVoice(await org(), fingerprintId, draft, surface));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setRunning(false);
    }
  };

  return (
    <Card className="space-y-3 p-4" data-testid="voice-try">
      <div>
        <h2 className="text-sm font-medium text-foreground">Fix a draft&apos;s voice</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          The same check every drafting job runs: the tells are found, rewritten span by span with every fact kept,
          and re-checked. A draft that still fails comes back with a header naming what is left.
        </p>
      </div>
      <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={6} placeholder="Paste a draft" aria-label="Draft" />
      <div className="flex flex-wrap items-center gap-3">
        <select aria-label="Where it will appear" className={selectClass} value={surface} onChange={(e) => setSurface(e.target.value as VoiceSurface)}>
          {SURFACES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <Button onClick={run} disabled={running || !draft.trim()}>
          {running ? <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden /> : <Wand2 className="mr-1 h-4 w-4" aria-hidden />}
          Fix voice
        </Button>
        {!draft.trim() ? <span className="text-xs text-muted-foreground">Paste a draft to check it.</span> : null}
        {error ? <span className="text-sm text-destructive">{error}</span> : null}
      </div>
      {outcome ? (
        <div className="space-y-2 rounded-md border border-border p-3 text-sm" data-testid="voice-outcome">
          <p className="font-medium text-foreground">
            {outcome.status === "passed"
              ? "Passes the voice check as written."
              : outcome.status === "fixed"
                ? `Fixed in ${outcome.retries} ${outcome.retries === 1 ? "rewrite" : "rewrites"}.`
                : "Still fails after the allowed rewrites; returned anyway for you to review."}
          </p>
          {(outcome.initial_tells ?? []).length > 0 ? (
            <p className="text-xs text-muted-foreground">Tells found: {(outcome.initial_tells ?? []).join(", ")}</p>
          ) : null}
          {(outcome.rounds ?? []).map((r) => (
            <p key={r.attempt} className="text-xs text-muted-foreground">
              Rewrite {r.attempt}:{" "}
              {r.error
                ? `failed (${r.error})`
                : `${(r.changes ?? []).length} change(s)${(r.unfixable ?? []).length ? `; could not fix ${(r.unfixable ?? []).map((u) => String(u.rule_id)).join(", ")}` : ""}`}
            </p>
          ))}
          <pre className="whitespace-pre-wrap rounded bg-muted p-2 font-sans text-sm text-foreground">{outcome.text}</pre>
        </div>
      ) : null}
    </Card>
  );
}
