"use client";

// features/esign/signing/OutsiderSigning.tsx — AN OUTSIDER'S WAY IN (SPEC-ESIGN §5.4).
//
// The link is `/x/sign#t=<secret>`: the secret rides in the FRAGMENT, which a browser never sends
// to any server, so it is read here and only ever posted in a request body. Opening the page sends
// nothing (a mail scanner that prefetches the link costs no code and no use); the code goes out
// only when the person presses the button. The verified session is kept in this tab's
// sessionStorage so a reload does not spend the link's single use again; it dies with the tab.

import { useEffect, useState } from "react";
import { Loader2, Lock, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@ai-matrx/design-system/controls";
import { useAppDispatch } from "@/lib/redux/hooks";

import { SigningSurface } from "./SigningSurface";
import {
  openOutsiderLink,
  sendOutsiderCode,
  type SigningDoor,
  verifyOutsiderCode,
} from "./signingService";

const DEAD = "This link is no longer valid. Ask the sender for a new one.";
const UNREACHABLE = "We could not reach AI Matrx just now. Your link is fine — try again in a moment.";

type Phase =
  | { kind: "loading" }
  | { kind: "dead"; message: string }
  | { kind: "code"; maskedTarget: string | null; sent: boolean }
  | { kind: "signing"; door: SigningDoor };

const LINK_KEY = "esign-link";

/**
 * The link secret, taken OUT of the address bar on first read. Left there it would sit in the
 * browser history and ride along as the page URL in any error report this page files. It is kept
 * in this tab's sessionStorage instead, so a reload still knows which link it is.
 */
function takeSecret(): string | null {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const fromHash = params.get("t");
  if (fromHash) {
    // `null`, never `window.history.state`: Next's patched replaceState skips its router when the
    // state carries its own marker (`__NA`), so the router kept the URL WITH the secret and wrote
    // it back on its next update (seen 2026-10-04 after a field press). `null` syncs the router.
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
  }
  let t = fromHash;
  try {
    if (t) window.sessionStorage.setItem(LINK_KEY, t);
    else t = window.sessionStorage.getItem(LINK_KEY);
  } catch {
    // A private window without storage still signs; a reload there needs the emailed link again.
  }
  return t && /^[A-Za-z0-9]{40,48}$/.test(t) ? t : null;
}

function storageKey(secret: string): string {
  return `esign-session:${secret.slice(0, 12)}`;
}

function readStoredSession(secret: string): string | null {
  try {
    return window.sessionStorage.getItem(storageKey(secret));
  } catch {
    return null;
  }
}

function forgetSession(secret: string) {
  try {
    window.sessionStorage.removeItem(storageKey(secret));
  } catch {
    // nothing stored
  }
}

function storeSession(secret: string, session: string) {
  try {
    window.sessionStorage.setItem(storageKey(secret), session);
  } catch {
    // A private window without storage still signs; a reload there asks for a new code.
  }
}

export function OutsiderSigning() {
  const dispatch = useAppDispatch();
  const [secret, setSecret] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"send" | "verify" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const found = takeSecret();
    if (!found) {
      setPhase({ kind: "dead", message: DEAD });
      return;
    }
    setSecret(found);
    const stored = readStoredSession(found);
    if (stored) {
      setPhase({ kind: "signing", door: { kind: "outsider", session: stored } });
      return;
    }
    let live = true;
    openOutsiderLink(dispatch, found)
      .then((answer) => {
        if (!live) return;
        setPhase(
          answer.ok
            ? { kind: "code", maskedTarget: answer.masked_target ?? null, sent: false }
            : { kind: "dead", message: answer.message ?? DEAD },
        );
      })
      .catch(() => live && setPhase({ kind: "dead", message: UNREACHABLE }));
    return () => {
      live = false;
    };
  }, [dispatch]);

  async function verify(token: string, value: string | null) {
    setBusy("verify");
    setNotice(null);
    try {
      const answer = await verifyOutsiderCode(dispatch, token, value);
      if (answer.ok && answer.session) {
        storeSession(token, answer.session);
        setPhase({ kind: "signing", door: { kind: "outsider", session: answer.session } });
      } else {
        setNotice("That code did not work. Check it, or send a new one.");
      }
    } catch {
      setNotice(UNREACHABLE);
    } finally {
      setBusy(null);
    }
  }

  async function send(token: string) {
    setBusy("send");
    setNotice(null);
    try {
      const answer = await sendOutsiderCode(dispatch, token);
      if (!answer.ok) {
        setNotice(answer.message ?? DEAD);
      } else if (answer.no_code_required) {
        await verify(token, null);
      } else {
        setPhase((p) => (p.kind === "code" ? { ...p, sent: true } : p));
      }
    } catch {
      setNotice(UNREACHABLE);
    } finally {
      setBusy((b) => (b === "send" ? null : b));
    }
  }

  if (phase.kind === "signing") {
    return (
      <SigningSurface
        door={phase.door}
        onDoorClosed={() => {
          if (!secret) return;
          forgetSession(secret);
          setCode("");
          setPhase({ kind: "loading" });
          openOutsiderLink(dispatch, secret)
            .then((answer) =>
              setPhase(
                answer.ok
                  ? { kind: "code", maskedTarget: answer.masked_target ?? null, sent: false }
                  : { kind: "dead", message: answer.message ?? DEAD },
              ),
            )
            .catch(() => setPhase({ kind: "dead", message: UNREACHABLE }));
        }}
      />
    );
  }

  return (
    <main className="flex h-dvh flex-col items-center justify-center bg-textured px-6">
      {phase.kind === "loading" && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}

      {phase.kind === "dead" && (
        <div className="flex max-w-md flex-col items-center gap-3 text-center">
          <XCircle className="h-8 w-8 text-muted-foreground" />
          <p className="text-base text-foreground">{phase.message}</p>
        </div>
      )}

      {phase.kind === "code" && secret && (
        <div className="flex w-full max-w-sm flex-col gap-4">
          <div className="flex items-center gap-2 text-base font-semibold text-foreground">
            <Lock className="h-4 w-4" /> A document is waiting for your signature
          </div>
          {!phase.sent ? (
            <>
              <p className="text-sm text-muted-foreground">
                {phase.maskedTarget ? `We will send a code to ${phase.maskedTarget}.` : "We will send you a code."}
              </p>
              <Button icon={busy === "send" && <Loader2 className="animate-spin" />} type="submit" variant="primary" disabled={busy !== null} onClick={() => void send(secret)}>Send me the code
              </Button>
            </>
          ) : (
            <form
              className="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (code.trim()) void verify(secret, code.trim());
              }}
            >
              <Label htmlFor="esign-code">Code{phase.maskedTarget ? ` sent to ${phase.maskedTarget}` : ""}</Label>
              <Input
                id="esign-code"
                value={code}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              />
              <Button icon={busy === "verify" && <Loader2 className="animate-spin" />} variant="primary" type="submit" disabled={busy !== null || code.trim().length < 6}>Open the document
              </Button>
              <Button type="button" variant="quiet" disabled={busy !== null} onClick={() => void send(secret)}>
                Send a new code
              </Button>
            </form>
          )}
          {notice && <p className="text-sm text-destructive">{notice}</p>}
        </div>
      )}
    </main>
  );
}
