"use client";

// The Phone tab (S7.6): a QR code and "text me a link"; the phone page draws or uploads; this panel
// polls `door.handoffStatus` every 2 s and hands the finished image up. The handoff survives a
// refresh (sessionStorage per tab) and an OPENED handoff is never restarted (A-R5).

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, MessageSquareText, RefreshCw, Smartphone } from "lucide-react";
import { Button, Field } from "@ai-matrx/design-system/controls";

import type { SignerDoorApi } from "../../contract/signerDoor";
import { pngBase64ToDataUrl } from "../render";
import type { Candidate } from "../types";

import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
interface StoredHandoff {
  handoff_id: string;
  secret: string;
  path: string;
  expires_at: string;
  last4?: string;
}

const storeKey = (target: string) => `esign.handoff.${target}`;

function readStored(target: string): StoredHandoff | null {
  try {
    const raw = sessionStorage.getItem(storeKey(target));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredHandoff;
    return Date.parse(parsed.expires_at) > Date.now() ? parsed : null;
  } catch {
    return null;
  }
}

function toE164(raw: string): string | null {
  const digits = raw.replace(/[^\d+]/g, "");
  if (/^\+\d{8,15}$/.test(digits)) return digits;
  const only = digits.replace(/\D/g, "");
  if (only.length === 10) return `+1${only}`;
  if (only.length === 11 && only.startsWith("1")) return `+${only}`;
  return null;
}

type Phase = "starting" | "waiting" | "opened" | "got" | "ended" | "failed";

export function PhoneTab({
  door,
  target,
  onCandidate,
}: {
  door: SignerDoorApi;
  target: "signature" | "initials";
  onCandidate: (c: Candidate | null) => void;
}) {
  const [handoff, setHandoff] = useState<StoredHandoff | null>(null);
  const [phase, setPhase] = useState<Phase>("starting");
  const [qr, setQr] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const started = useRef(false);

  const begin = useCallback(async () => {
    setPhase("starting");
    setProblem(null);
    setSentTo(null);
    setQr(null);
    onCandidate(null);
    try {
      const fresh = await door.handoffStart(target);
      sessionStorage.setItem(storeKey(target), JSON.stringify(fresh));
      setHandoff(fresh);
      setPhase("waiting");
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "Could not start the phone link.");
      setPhase("failed");
    }
  }, [door, target, onCandidate]);

  // Resume a live handoff after a refresh; start one only when there is none.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const stored = readStored(target);
    if (stored) {
      setHandoff(stored);
      setSentTo(stored.last4 ?? null);
      setPhase("waiting");
    } else {
      void begin();
    }
  }, [target, begin]);

  // The QR points at the full address of the phone page.
  useEffect(() => {
    if (!handoff) return;
    let cancelled = false;
    const url = `${window.location.origin}${handoff.path}`;
    void import("qrcode").then(async (QR) => {
      const dataUrl = await QR.toDataURL(url, { margin: 1, width: 360, color: { dark: "#000000", light: "#ffffff" } });
      if (!cancelled) setQr(dataUrl);
    });
    return () => {
      cancelled = true;
    };
  }, [handoff]);

  // Poll every 2 s while this panel is open and the handoff is alive.
  useEffect(() => {
    if (!handoff || (phase !== "waiting" && phase !== "opened")) return;
    let stop = false;
    const tick = async () => {
      try {
        const s = await door.handoffStatus(handoff.handoff_id);
        if (stop) return;
        if (s.status === "completed" && s.image_base64) {
          sessionStorage.removeItem(storeKey(target));
          onCandidate({
            kind: s.method === "uploaded" ? "uploaded" : "drawn",
            source: "phone",
            handoff_id: handoff.handoff_id,
            preview_url: pngBase64ToDataUrl(s.image_base64, s.mime_type ?? "image/png"),
          });
          setPhase("got");
        } else if (s.status === "opened") {
          setPhase("opened");
        } else if (s.status === "expired" || s.status === "cancelled") {
          sessionStorage.removeItem(storeKey(target));
          setPhase("ended");
        }
      } catch {
        /* a missed poll is retried in 2 s */
      }
    };
    const id = window.setInterval(tick, 2000);
    return () => {
      stop = true;
      window.clearInterval(id);
    };
  }, [handoff, phase, door, target, onCandidate]);

  const sendText = async () => {
    if (!handoff) return;
    const e164 = toE164(phone);
    if (!e164) {
      setProblem("Enter a mobile number with its area code.");
      return;
    }
    setSending(true);
    setProblem(null);
    try {
      const { last4 } = await door.handoffText(handoff.handoff_id, handoff.secret, e164);
      setSentTo(last4);
      sessionStorage.setItem(storeKey(target), JSON.stringify({ ...handoff, last4 }));
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "The text did not go out.");
    } finally {
      setSending(false);
    }
  };

  const live = phase === "waiting" || phase === "opened";
  const status =
    phase === "opened"
      ? "Phone connected. Waiting for your signature."
      : phase === "waiting" && sentTo
        ? `Link sent to the number ending ${sentTo}. Waiting for your signature.`
        : phase === "waiting"
          ? "Waiting for your phone."
          : phase === "got"
            ? "Received from your phone."
            : phase === "ended"
              ? "That link has expired."
              : "";

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
      <div className="mx-auto flex size-40 shrink-0 items-center justify-center rounded-md border border-border bg-white p-1.5 sm:mx-0">
        {qr && live ? (
          // eslint-disable-next-line @next/next/no-img-element -- a data URL the browser just drew
          <img src={qr} alt="QR code that opens the signature page on your phone" className="size-full" />
        ) : live || phase === "starting" ? (
          <Loader2 className="size-6 animate-spin text-muted-foreground" aria-label="Preparing the code" />
        ) : (
          <Smartphone className="size-8 text-muted-foreground" aria-hidden />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <p className="text-sm font-medium text-foreground">Scan with your phone camera</p>
        {live && (
          <>
            <p className="text-xs text-muted-foreground">Or text yourself the link.</p>
            <div className="flex gap-2">
              <Field
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="(555) 123-4567"
                aria-label="Mobile number"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
              <Button
                variant="outline"
                icon={<MessageSquareText />}
                disabled={sending || phone.trim() === ""}
                onClick={() => void sendText()}
              >
                {sending ? "Sending" : "Text me a link"}
              </Button>
            </div>
          </>
        )}
        <p role="status" aria-live="polite" className="text-xs text-muted-foreground">
          {status}
        </p>
        {problem && (
          <p role="alert" className="text-xs text-destructive">
            {problem}
          <ErrorAlchemyMenu error={problem} /></p>
        )}
        {(phase === "ended" || phase === "failed" || phase === "got") && (
          <div>
            <Button variant="outline" icon={<RefreshCw />} onClick={() => void begin()}>
              Try again
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
