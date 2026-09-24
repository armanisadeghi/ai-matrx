"use client";

// app/(link)/f/[formId]/PublicFormRunner.tsx — THE ONLY CLIENT CODE ON THE
// PUBLIC FORM PAGE, and it is a mount and a few fetches.
//
// `FormRunner` is the SAME component the owner sees inside the app. Its public
// arm takes the Fields the server already resolved and a submit port, so it
// mounts no record-store client at all: the browser on this page holds no key,
// knows no organization id and cannot read a row. Everything it knows, the
// server handed it.
//
// A SCREEN IS ABSENT OR HONEST. A refused answer shows the STORE's own sentence
// — "This form needs full name, date of birth." — because `custom.form_submit`
// names every missing question so a screen can point at it, rather than one
// generic error beside a form with twenty questions.
//
// AND A PERSON NEVER LOSES HER PLACE (lane S7-PRIME). A moment after each change
// the answers so far are saved through `custom.form_draft_save` under a secret
// only this browser holds (kept in localStorage) — never a record, never a
// submission. The page offers that place as a link, so she can finish on another
// device; the link carries the secret in the URL FRAGMENT (`#resume=…`), which no
// server or log ever sees. Coming back — same browser or the link — reads the
// place through `custom.form_draft_read` and the form opens where she stopped.
// Sending uses the place up: the secret travels as the submission's client key,
// and the store marks the place sent in the same transaction.

import { useCallback, useEffect, useRef, useState } from "react";
import { FormRunner, type FormSubmitOutcome } from "@ai-matrx/records-ui";
import type { Field, RuleExpression } from "@ai-matrx/records";

import type { PublicForm } from "@/features/forms/service";

/**
 * What the runner's `whichAsked` port answers — records-ui's `FormAsked`, 0.84.10 onwards.
 * Declared here, and the ports handed over through `ports` below, so this page still
 * compiles against 0.84.8 until the chair publishes; on 0.84.8 those ports are ignored
 * (the runner shows every question with its "cannot branch" sentence, starts empty and
 * keeps no place) — which is honest, never a silent wrong answer. When `@ai-matrx/records-ui`
 * 0.84.12 is live, import `FormAsked`, pass `whichAsked`, `initialAnswers` and
 * `onAnswersChange` by name, and hand `thankYou` over typed, so a rename is a build failure.
 */
type PublicFormAsked =
  | { ok: true; asks: ReadonlyArray<{ field: string; asked: boolean; said?: string | null }> }
  | { ok: false; message: string };

/** Where this browser keeps the secret to its saved place, per form. */
const placeKey = (formId: string) => `matrx:form-place:${formId}`;
/** How long after the last keystroke the place is saved. */
const SAVE_AFTER_MS = 1200;

function readStoredPlace(formId: string): string | null {
  try {
    return window.localStorage.getItem(placeKey(formId));
  } catch {
    return null; // private mode or blocked storage: the place still works for this visit
  }
}
function storePlace(formId: string, secret: string | null) {
  try {
    if (secret) window.localStorage.setItem(placeKey(formId), secret);
    else window.localStorage.removeItem(placeKey(formId));
  } catch {
    // Storage refused. The resume link below still carries the place; nothing else is lost.
  }
}

type SaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; at: string | null; expiresAt: string | null }
  | { kind: "refused"; message: string };

type Resumed =
  | { kind: "none" }
  | { kind: "found"; answers: Record<string, unknown>; savedAt: string | null }
  | { kind: "gone"; message: string };

export function PublicFormRunner({ form, prefill }: { form: PublicForm; prefill?: Record<string, unknown> }) {
  const [secret, setSecret] = useState<string | null>(null);
  const [resumed, setResumed] = useState<Resumed>({ kind: "none" });
  const [runKey, setRunKey] = useState(0);
  const [save, setSave] = useState<SaveState>({ kind: "idle" });
  const [sent, setSent] = useState(false);
  const [copied, setCopied] = useState<"idle" | "copied" | "manual">("idle");
  const secretRef = useRef<string | null>(null);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef<Promise<void> | null>(null);

  // ── WHERE WAS I: the link's fragment first, then this browser's own memory ──────────
  useEffect(() => {
    let cancelled = false;
    const fromLink = /(?:^|[#&])resume=([A-Za-z0-9_-]{16,})/.exec(window.location.hash)?.[1] ?? null;
    if (fromLink) {
      // The secret is this person's; it does not stay in the address bar to be screenshotted.
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
    const stored = fromLink ?? readStoredPlace(form.form_id);
    if (!stored) return;
    void (async () => {
      try {
        const response = await fetch(`/api/forms/${form.form_id}/draft/resume`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ draft: stored }),
        });
        const body = (await response.json()) as {
          ok?: boolean;
          state?: string;
          answers?: Record<string, unknown> | null;
          saved_at?: string | null;
          expires_at?: string | null;
          message?: string | null;
        };
        if (cancelled) return;
        if (body.ok && body.answers) {
          secretRef.current = stored;
          setSecret(stored);
          storePlace(form.form_id, stored);
          setResumed({ kind: "found", answers: body.answers, savedAt: body.saved_at ?? null });
          setSave({ kind: "saved", at: body.saved_at ?? null, expiresAt: body.expires_at ?? null });
          setRunKey((k) => k + 1); // the runner opens with her answers, where she stopped
          return;
        }
        // Gone — sent, expired, closed or never there. Forget it here, and say so if it was hers.
        storePlace(form.form_id, null);
        if (body.message && (fromLink || body.state !== "not_found")) setResumed({ kind: "gone", message: body.message });
      } catch {
        if (!cancelled && fromLink) {
          setResumed({ kind: "gone", message: "Your saved answers could not be opened just now. The form starts fresh." });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [form.form_id]);

  // ── KEEP MY PLACE: a moment after each change ─────────────────────────────────────────
  const persist = useCallback(
    async (answers: Record<string, unknown>) => {
      const filled = Object.values(answers).some((v) => v !== undefined && v !== null && v !== "");
      if (!filled && !secretRef.current) return; // nothing typed yet, nothing to keep
      setSave({ kind: "saving" });
      try {
        const response = await fetch(`/api/forms/${form.form_id}/draft`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ answers, draft: secretRef.current }),
        });
        const body = (await response.json()) as {
          ok?: boolean;
          state?: string;
          draft?: string | null;
          saved_at?: string | null;
          expires_at?: string | null;
          message?: string | null;
        };
        if (body.ok) {
          if (body.draft && body.draft !== secretRef.current) {
            secretRef.current = body.draft;
            setSecret(body.draft);
            storePlace(form.form_id, body.draft);
          }
          setSave({ kind: "saved", at: body.saved_at ?? null, expiresAt: body.expires_at ?? null });
          return;
        }
        if (body.state === "refused" && secretRef.current) {
          // The key no longer opens anything (a form that changed hands, a tampered link):
          // forget it, and the next change starts a new place.
          secretRef.current = null;
          setSecret(null);
          storePlace(form.form_id, null);
        }
        setSave({
          kind: "refused",
          message: body.message ?? "Your answers could not be saved just now. They are still here; sending works as usual.",
        });
      } catch {
        setSave({
          kind: "refused",
          message: "Your answers could not be saved just now — the connection dropped. They are still on this page.",
        });
      }
    },
    [form.form_id],
  );

  const onAnswersChange = useCallback(
    (answers: Record<string, unknown>) => {
      if (pending.current) clearTimeout(pending.current);
      pending.current = setTimeout(() => {
        pending.current = null;
        inFlight.current = persist(answers).finally(() => {
          inFlight.current = null;
        });
      }, SAVE_AFTER_MS);
    },
    [persist],
  );

  useEffect(
    () => () => {
      if (pending.current) clearTimeout(pending.current);
    },
    [],
  );

  const submit = useCallback(
    async (values: Record<string, unknown>): Promise<FormSubmitOutcome> => {
      // A save still waiting would re-open a place the send is about to use up.
      if (pending.current) {
        clearTimeout(pending.current);
        pending.current = null;
      }
      if (inFlight.current) await inFlight.current;
      try {
        const response = await fetch(`/api/forms/${form.form_id}/submit`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          // THE SAVED PLACE'S SECRET IS THE CLIENT KEY: the store marks the place sent in the
          // same transaction, and a second press of Send writes nothing twice.
          body: JSON.stringify({ values, clientKey: secretRef.current }),
        });
        const body = (await response.json()) as {
          ok?: boolean;
          state?: string;
          message?: string | null;
          record_id?: string | null;
        };
        if (!response.ok || body.ok === false) {
          return {
            ok: false,
            message:
              body.message ??
              "This answer could not be sent. Nothing was saved, so it is safe to try again.",
          };
        }
        storePlace(form.form_id, null);
        secretRef.current = null;
        setSecret(null);
        setSent(true);
        // HELD IS NOT SENT-AND-FORGOTTEN. An answer whose form has no accept
        // Rule waits for a person, and the thank-you screen says so in the
        // store's own words instead of implying it landed in the table.
        return {
          ok: true,
          recordId: body.record_id ?? null,
          ...(body.message ? { message: body.message } : {}),
        };
      } catch {
        return {
          ok: false,
          message:
            "This answer did not reach us — the connection dropped. Nothing was saved, so pressing send again is safe.",
        };
      }
    },
    [form.form_id],
  );

  // WHICH QUESTIONS COME NEXT — the store's answer, through the server (lane FORMS-FIX-1).
  // A prefilled or resumed answer is asked about exactly like a typed one (lane S7-PRIME).
  const whichAsked = useCallback(
    async (values: Record<string, unknown>): Promise<PublicFormAsked> => {
      try {
        const response = await fetch(`/api/forms/${form.form_id}/asks`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ values }),
        });
        const body = (await response.json()) as
          | { ok: true; asks: Array<{ field: string; asked: boolean; said?: string | null }> }
          | { ok: false; message?: string | null };
        if (!response.ok || body.ok !== true) {
          return {
            ok: false,
            message:
              (body as { message?: string | null }).message ??
              "This form could not work out which questions come next, so all of them are shown.",
          };
        }
        return { ok: true, asks: body.asks };
      } catch {
        return {
          ok: false,
          message:
            "This form could not reach us to work out which questions come next, so all of them are shown.",
        };
      }
    },
    [form.form_id],
  );

  function startOver() {
    if (pending.current) clearTimeout(pending.current);
    pending.current = null;
    storePlace(form.form_id, null);
    secretRef.current = null;
    setSecret(null);
    setSave({ kind: "idle" });
    setResumed({ kind: "none" });
    setRunKey((k) => k + 1);
  }

  async function copyResumeLink(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied("copied");
      window.setTimeout(() => setCopied("idle"), 1600);
    } catch {
      setCopied("manual");
    }
  }

  const initialAnswers = resumed.kind === "found" ? { ...(prefill ?? {}), ...resumed.answers } : (prefill ?? {});
  const thankYou = form.presentation?.thank_you ?? null;
  const resumeUrl =
    secret && typeof window !== "undefined"
      ? `${window.location.origin}${window.location.pathname}#resume=${secret}`
      : null;

  // THE PORTS 0.84.8 DOES NOT KNOW YET — see the note at the top of this file.
  const ports: Record<string, unknown> = { whichAsked, initialAnswers, onAnswersChange };
  const spec: Record<string, unknown> = {
    name: form.title,
    subject: form.table_id,
    intro: form.presentation?.intro ?? null,
    questions: (form.presentation?.questions ?? []).map((q) => ({
      field: q.field,
      ask: q.ask ?? null,
      help: q.help ?? null,
      required: q.required ?? null,
      showIf: (q.showIf as RuleExpression | null | undefined) ?? null,
    })),
    flow: form.presentation?.flow ?? "one-at-a-time",
    theme: form.presentation?.theme ?? null,
    thankYou: thankYou
      ? { title: thankYou.title ?? null, body: thankYou.body ?? null, redirectUrl: thankYou.redirect_url ?? null }
      : null,
    submitLabel: form.presentation?.submit_label ?? null,
    isPublic: true,
  };

  return (
    <>
      {resumed.kind === "found" && !sent ? (
        <p className="mt-3 flex flex-wrap items-center gap-x-2 rounded border border-dashed px-2 py-1 text-xs text-muted-foreground">
          <span>Picked up where you left off{resumed.savedAt ? ` — saved ${whenSaid(resumed.savedAt)}` : ""}.</span>
          <button type="button" className="underline underline-offset-2" onClick={startOver}>
            Start over
          </button>
        </p>
      ) : null}
      {resumed.kind === "gone" && !sent ? (
        <p className="mt-3 rounded border border-dashed px-2 py-1 text-xs text-muted-foreground">{resumed.message}</p>
      ) : null}

      <FormRunner
        key={runKey}
        form={spec as unknown as Parameters<typeof FormRunner>[0]["form"]}
        fields={form.fields as unknown as Field[]}
        honeypotKey={form.honeypot_key}
        onSubmit={submit}
        {...ports}
      />

      {!sent && save.kind !== "idle" ? (
        <div className="mt-2 flex flex-col gap-1 text-xs text-muted-foreground" aria-live="polite">
          {save.kind === "saving" ? <span>Saving your answers…</span> : null}
          {save.kind === "refused" ? <span>{save.message}</span> : null}
          {save.kind === "saved" && resumeUrl ? (
            <span className="flex flex-wrap items-center gap-x-2">
              <span>
                Your answers are saved{save.at ? ` (${whenSaid(save.at)})` : ""}. To finish on another device, use your
                own link.
              </span>
              <button type="button" className="underline underline-offset-2" onClick={() => void copyResumeLink(resumeUrl)}>
                {copied === "copied" ? "Link copied" : "Copy my link"}
              </button>
            </span>
          ) : null}
          {copied === "manual" && resumeUrl ? (
            <span className="break-all rounded border border-dashed px-2 py-1">
              This browser would not copy for you, so here is your link to copy by hand: {resumeUrl}
            </span>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

/** "just now", "3 minutes ago", or the day — said the way a person says it. */
function whenSaid(at: string): string {
  const then = new Date(at).getTime();
  if (Number.isNaN(then)) return "earlier";
  const minutes = Math.round((Date.now() - then) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  return `on ${new Date(then).toLocaleDateString(undefined, { month: "long", day: "numeric" })}`;
}
