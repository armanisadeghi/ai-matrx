"use client";

// features/esign/signer/OutsiderEntry.tsx — AN OUTSIDE SIGNER'S WAY IN (esign-parity CONTRACT §6.4,
// §5.9, §13.2; SPEC-ESIGN §5.4).
//
// The link is `/x/sign#t=<secret>`: the secret rides in the FRAGMENT, which a browser never sends to
// any server, so it is read here, taken out of the address bar, and only ever posted in a request
// body. By default (factor `none`, REGISTER ruling F13) the link alone opens the document: the page
// opens a session at once and the consent gate over the visible document names the sender, the
// organization, the document and their message. When the sender asked for a code, the code step is
// headed by the same facts. A session another window took over says so and offers "Continue here";
// the dead-link sentence is only for a link that is truly dead.

import { useEffect, useEffectEvent, useState } from "react";
import { Lock, MonitorSmartphone, XCircle } from "lucide-react";

import { Button, Field } from "@ai-matrx/design-system/controls";
import { Spinner } from "@/components/ui/loaders/Spinner";
import { callApi, type ApiCallResult } from "@/lib/api/call-api";
import { useAppDispatch } from "@/lib/redux/hooks";
import type { AppDispatch } from "@/lib/redux/store";

import type { SessionEnded, SignerDoorApi } from "../contract/signerDoor";
import { createSignerDoor } from "./door";
import { LandingHeader, type LandingFacts } from "./parts/Panels";
import { SignerSurface } from "./SignerSurface";
import { lockedNotice, UNREACHABLE } from "./text";

const DEAD = "This link is no longer valid. Ask the sender for a new one.";
const LINK_KEY = "esign-link";

type Factor = "none" | "email_code" | "access_code";

type Phase =
  | { kind: "loading" }
  | { kind: "dead"; message: string }
  | { kind: "code"; factor: Exclude<Factor, "none">; masked: string | null; sent: boolean }
  | { kind: "taken_over" }
  | { kind: "signing"; door: SignerDoorApi };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

/** The link secret, taken OUT of the address bar on first read and kept in this tab only. */
function takeSecret(): string | null {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const fromHash = params.get("t");
  if (fromHash) {
    // `null`, never `window.history.state`: Next's patched replaceState keeps the URL WITH the
    // secret when the state carries its own marker (seen 2026-10-04).
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
  }
  let t = fromHash;
  try {
    if (t) window.sessionStorage.setItem(LINK_KEY, t);
    else t = window.sessionStorage.getItem(LINK_KEY);
  } catch {
    // A private window without storage still signs; a reload there needs the emailed link again.
  }
  return t && /^[A-Za-z0-9_-]{32,64}$/.test(t) ? t : null;
}

const sessionKey = (secret: string) => `esign-session:${secret.slice(0, 12)}`;

function readStored(secret: string): string | null {
  try {
    return window.sessionStorage.getItem(sessionKey(secret));
  } catch {
    return null;
  }
}

function store(secret: string, session: string | null) {
  try {
    if (session) window.sessionStorage.setItem(sessionKey(secret), session);
    else window.sessionStorage.removeItem(sessionKey(secret));
  } catch {
    // nothing stored: a reload opens the link again
  }
}

function answerOf(result: ApiCallResult): Record<string, unknown> {
  if (!result.error && isRecord(result.data)) return result.data;
  const body = result.error?.serverDetail;
  if (isRecord(body) && isRecord(body.detail)) return { ok: false, ...body.detail };
  throw new Error("transport");
}

async function post(dispatch: AppDispatch, path: "open" | "code" | "verify", body: { token: string; code?: string | null }) {
  const result =
    path === "open"
      ? await dispatch(callApi({ path: "/esign/signing/outsider/open", method: "POST", body: { token: body.token }, expectedErrorStatuses: [409, 422], organizationFreeRead: true }))
      : path === "code"
        ? await dispatch(callApi({ path: "/esign/signing/outsider/code", method: "POST", body: { token: body.token }, expectedErrorStatuses: [409, 422], organizationFreeRead: true }))
        : await dispatch(callApi({ path: "/esign/signing/outsider/verify", method: "POST", body: { token: body.token, code: body.code ?? null }, expectedErrorStatuses: [409, 422], organizationFreeRead: true }));
  return answerOf(result);
}

/** The landing facts the open answer carries (§6.4), when it carries them. */
function landingOf(open: Record<string, unknown>): LandingFacts | null {
  const l = isRecord(open.landing) ? open.landing : null;
  if (!l) return null;
  const sender = isRecord(l.sender) ? l.sender : {};
  const org = isRecord(l.organization) ? l.organization : {};
  const env = isRecord(l.envelope) ? l.envelope : {};
  const docs = Array.isArray(l.documents) ? l.documents.filter(isRecord) : [];
  const pages = docs.every((d) => typeof d.page_count === "number") ? docs.reduce((n, d) => n + Number(d.page_count), 0) : null;
  return {
    senderName: str(sender.name) ?? "The sender",
    organizationName: str(org.name) ?? "AI Matrx",
    logoUrl: str(org.logo_url),
    title: str(env.title) ?? "A document",
    pages: docs.length > 0 ? pages : null,
    documents: docs.length,
    message: str(env.message),
    privateMessage: str(l.private_message),
    expiresAt: str(env.expires_at),
  };
}

function factorOf(open: Record<string, unknown>): Factor {
  const l = isRecord(open.landing) ? open.landing : {};
  const f = str(l.verification_factor) ?? str(open.verification_factor);
  return f === "none" || f === "access_code" ? f : "email_code";
}

/** The document, dimmed behind the code step. The server releases no page before the code, so this is
 *  a stand-in sheet that says so — never page content. */
function GatedPaper({ pages }: { pages: number | null }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 flex items-start justify-center overflow-hidden px-5 pt-10 opacity-60">
      <div className="flex aspect-[8.5/11] w-full max-w-xl flex-col gap-3 rounded-md border border-border bg-card p-8 shadow-sm">
        <div className="h-4 w-1/2 rounded bg-muted" />
        {Array.from({ length: 14 }, (_, i) => (
          <div key={i} className="h-2.5 rounded bg-muted" style={{ width: `${i % 5 === 4 ? 60 : 100 - ((i * 7) % 18)}%` }} />
        ))}
        <p className="mt-auto text-center type-secondary text-muted-foreground">
          {pages ? `${pages} ${pages === 1 ? "page" : "pages"} · opens after the code` : "Opens after the code"}
        </p>
      </div>
    </div>
  );
}

export function OutsiderEntry() {
  const dispatch = useAppDispatch();
  const [secret, setSecret] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [landing, setLanding] = useState<LandingFacts | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"send" | "verify" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function sign(session: string) {
    setPhase({ kind: "signing", door: createSignerDoor(dispatch, { kind: "outsider", session }) });
  }

  async function verify(token: string, value: string | null): Promise<boolean> {
    setBusy("verify");
    setNotice(null);
    let a: Record<string, unknown>;
    try {
      a = await post(dispatch, "verify", { token, code: value });
    } catch {
      setNotice(UNREACHABLE);
      setBusy(null);
      return false;
    }
    // Read outside the try: the React Compiler cannot compile value blocks inside one.
    setBusy(null);
    const session = str(a.session);
    if (a.ok === true && session) {
      store(token, session);
      sign(session);
      return true;
    }
    const reason = str(a.reason) ?? str(a.code);
    if (reason === "code_locked") setNotice(lockedNotice(str(a.locked_until)));
    else if (typeof a.attempts_left === "number") setNotice(`That code did not work. ${a.attempts_left} ${a.attempts_left === 1 ? "try" : "tries"} left.`);
    else if (value === null) setPhase({ kind: "dead", message: str(a.message) ?? DEAD });
    else setNotice("That code did not work. Check it, or send a new one.");
    return false;
  }

  async function open(token: string) {
    setPhase({ kind: "loading" });
    let a: Record<string, unknown>;
    try {
      a = await post(dispatch, "open", { token });
    } catch {
      setPhase({ kind: "dead", message: UNREACHABLE });
      return;
    }
    if (a.ok !== true) {
      setPhase({ kind: "dead", message: str(a.message) ?? DEAD });
      return;
    }
    setLanding(landingOf(a));
    const factor = factorOf(a);
    if (factor === "none") {
      if (!(await verify(token, null))) setPhase((p) => (p.kind === "loading" ? { kind: "dead", message: DEAD } : p));
      return;
    }
    setPhase({ kind: "code", factor, masked: str(a.masked_target), sent: factor === "access_code" });
  }


  // Opening the link runs once per page (an effect event: it reads the latest state, never re-runs).
  const openOnce = useEffectEvent(() => {
    const found = takeSecret();
    if (!found) {
      setPhase({ kind: "dead", message: DEAD });
      return;
    }
    setSecret(found);
    const held = readStored(found);
    if (held) sign(held);
    else void open(found);
  });
  useEffect(() => {
    openOnce();
  }, []);

  async function sendCode(token: string) {
    setBusy("send");
    setNotice(null);
    let a: Record<string, unknown>;
    try {
      a = await post(dispatch, "code", { token });
    } catch {
      setNotice(UNREACHABLE);
      setBusy((b) => (b === "send" ? null : b));
      return;
    }
    if (a.ok !== true) setNotice(a.reason === "code_locked" ? lockedNotice(str(a.locked_until)) : (str(a.message) ?? DEAD));
    else if (a.no_code_required === true) await verify(token, null);
    else setPhase((p) => (p.kind === "code" ? { ...p, sent: true } : p));
    setBusy((b) => (b === "send" ? null : b));
  }

  function closed(why: SessionEnded) {
    if (!secret) return;
    store(secret, null);
    if (why.why === "taken_over") setPhase({ kind: "taken_over" });
    else void open(secret);
  }

  if (phase.kind === "signing") return <SignerSurface door={phase.door} onDoorClosed={closed} />;

  return (
    <main className="relative flex h-full flex-col items-center justify-center overflow-y-auto bg-textured px-5 py-8">
      {phase.kind === "loading" ? <Spinner size="sm" className="text-muted-foreground" /> : null}

      {phase.kind === "dead" ? (
        <div className="flex max-w-md flex-col items-center gap-3 text-center">
          <XCircle className="h-8 w-8 text-muted-foreground" />
          <p className="type-body text-foreground">{phase.message}</p>
        </div>
      ) : null}

      {phase.kind === "taken_over" && secret ? (
        <div className="flex max-w-sm flex-col items-center gap-3 text-center">
          <MonitorSmartphone className="h-8 w-8 text-muted-foreground" />
          <p className="type-title text-foreground">You opened this in another window.</p>
          <p className="type-body text-muted-foreground">Everything you entered is saved.</p>
          <Button variant="primary" onClick={() => void open(secret)}>
            Continue here
          </Button>
        </div>
      ) : null}

      {phase.kind === "code" && secret ? <GatedPaper pages={landing?.pages ?? null} /> : null}

      {phase.kind === "code" && secret ? (
        <div className="relative flex w-full max-w-sm flex-col gap-4 rounded-lg border border-border bg-card p-5 shadow-lg">
          {landing ? (
            <LandingHeader facts={landing} />
          ) : (
            <p className="flex items-center gap-2 type-title text-foreground">
              <Lock className="h-4 w-4" /> A document is waiting for your signature
            </p>
          )}
          {phase.factor === "access_code" ? (
            <p className="type-body text-muted-foreground">Enter the access code the sender gave you.</p>
          ) : !phase.sent ? (
            <p className="type-body text-muted-foreground">
              {phase.masked ? `We will email a code to ${phase.masked}.` : "We will email you a code."}
            </p>
          ) : null}
          {phase.factor === "email_code" && !phase.sent ? (
            <Button
              variant="primary"
              disabled={busy !== null}
              icon={busy === "send" ? <Spinner size="xs" className="text-current" /> : undefined}
              onClick={() => void sendCode(secret)}
            >
              Send me the code
            </Button>
          ) : (
            <form
              className="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (code.trim()) void verify(secret, code.trim());
              }}
            >
              {/* ui-exception: a one-time code — a raw value */}
              <Field
                aria-label={phase.factor === "access_code" ? "Access code" : `Code sent to ${phase.masked ?? "your email"}`}
                placeholder={phase.factor === "access_code" ? "Access code" : "6-digit code"}
                value={code}
                inputMode={phase.factor === "email_code" ? "numeric" : undefined}
                autoComplete="one-time-code"
                autoFocus
                onChange={(e) => setCode(phase.factor === "email_code" ? e.target.value.replace(/\D/g, "").slice(0, 6) : e.target.value)}
              />
              <Button
                variant="primary"
                type="submit"
                disabled={busy !== null || code.trim().length < (phase.factor === "email_code" ? 6 : 4)}
                icon={busy === "verify" ? <Spinner size="xs" className="text-current" /> : undefined}
              >
                Open the document
              </Button>
              {phase.factor === "email_code" ? (
                <Button type="button" variant="quiet" disabled={busy !== null} onClick={() => void sendCode(secret)}>
                  Send a new code
                </Button>
              ) : null}
            </form>
          )}
          {notice ? <p className="type-body text-destructive">{notice}</p> : null}
        </div>
      ) : null}
    </main>
  );
}
