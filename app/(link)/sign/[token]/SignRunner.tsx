"use client";

// app/(link)/sign/[token]/SignRunner.tsx — WHAT THE SIGNER DOES.
//
// DocuSign and Dropbox Sign are the bar, and what they get right is the SHAPE of
// the moment: read the document, then ONE control that is unmistakably "this is
// me agreeing", then a confirmation that says what just happened. What they get
// wrong — a chrome bar, a progress rail, a vendor's brand over somebody else's
// contract — is left out on purpose. This page is one document and one decision.
//
// MOBILE FIRST BECAUSE SIGNING IS A PHONE ACT. A client signs a proposal from
// the car park. `h-dvh` never `h-screen`, the safe-area inset at the foot, and
// the draw pad sized to the viewport so a finger has room. Drawing is the
// default tab on a touch device and typing is the default on a pointer, because
// that is the easier act on each.
//
// EVERY STEP HONEST:
//   · the document shown is the FROZEN one, and the page says so in the line
//     above it, with its version and the first twelve characters of the hash;
//   · Sign is disabled only when there is genuinely nothing to submit, and it
//     says what is missing rather than sitting there greyed and mute;
//   · a refusal shows the STORE's own sentence ("Please type your name as you
//     sign.", "This document changed after it was sent for signature…");
//   · declining is a real, visible, equal choice — not a hidden link — because a
//     signer who cannot say no has not been asked anything.

import { RichContentStaticStandard } from "@/components/rich-content/RichContentStaticProse";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, PenLine, Type as TypeIcon, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@ai-matrx/design-system";
import type { PublicSignRequest } from "@/features/esign/service";

type Mark = "typed" | "drawn";

export function SignRunner({
  token,
  request,
}: {
  token: string;
  request: PublicSignRequest;
}) {
  const [mark, setMark] = useState<Mark>("typed");
  const [name, setName] = useState(request.signer_name ?? "");
  const [drawn, setDrawn] = useState<string | null>(null);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ state: string; message: string | null } | null>(null);

  // A touch device gets the drawing pad first: on a phone a finger is the
  // easier mark, and on a desktop a keyboard is.
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches) {
      setMark("drawn");
    }
  }, []);

  const send = useCallback(
    async (body: Record<string, unknown>) => {
      setBusy(true);
      setError(null);
      try {
        const response = await fetch(`/api/sign/${token}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        const answer = (await response.json()) as {
          ok?: boolean;
          state?: string;
          message?: string | null;
        };
        if (!response.ok || answer.ok === false) {
          setError(
            answer.message ??
              "That did not reach us. Nothing was recorded, so it is safe to try again.",
          );
          return;
        }
        setDone({ state: answer.state ?? "signed", message: answer.message ?? null });
      } catch {
        setError(
          "That did not reach us — the connection dropped. Nothing was recorded, so trying again is safe.",
        );
      } finally {
        setBusy(false);
      }
    },
    [token],
  );

  if (done) {
    return (
      <section className="flex min-h-dvh flex-col justify-center text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted">
          {done.state === "declined" ? (
            <X className="size-5 text-muted-foreground" aria-hidden />
          ) : (
            <Check className="size-5 text-muted-foreground" aria-hidden />
          )}
        </div>
        <h1 className="mt-4 text-xl font-medium">
          {done.state === "declined" ? "Declined" : "Signed"}
        </h1>
        {/* The store's sentence, verbatim — "Signed by Dana Okonkwo." */}
        <p className="mt-2 text-sm text-muted-foreground">{done.message}</p>
        <p className="mt-6 text-xs text-muted-foreground">
          {done.state === "declined"
            ? "Whoever sent this has been told. You can close this page."
            : "A copy is on the record this document came from, and whoever sent it has been told. You can close this page."}
        </p>
      </section>
    );
  }

  const ready = mark === "typed" ? name.trim().length > 0 : drawn !== null;

  return (
    <section className="flex flex-col gap-5 pb-10">
      <header>
        <h1 className="text-xl font-medium">{request.document_title ?? "A document"}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {request.signer_name} — you have been asked to sign this.
        </p>
      </header>

      {/* THE FROZEN DOCUMENT, and the page says it is frozen. The version and
          the head of the hash are what make "this exact text" checkable rather
          than asserted. */}
      <div>
        <p className="mb-2 text-xs text-muted-foreground">
          This is version {request.document_version} of the document as it was sent
          {request.document_hash ? ` (${request.document_hash.slice(0, 12)})` : ""}. If it has
          changed since, this page will say so instead of letting you sign it.
        </p>
        {/* The frozen text, rendered through the one rich-content core and in
            the server HTML; the bytes signed are still `request.body`. */}
        <article className="max-h-[46vh] overflow-y-auto rounded-md border border-border bg-card p-4">
          <RichContentStaticStandard source={request.body ?? ""} />
        </article>
      </div>

      {declining ? (
        <div className="flex flex-col gap-3">
          <label className="text-sm font-medium" htmlFor="sign-decline-reason">
            Why are you declining? (optional)
          </label>
          <Textarea
            id="sign-decline-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={3}
            className="text-base"
            placeholder="Whoever sent this will see exactly what you write."
          />
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <div className="flex gap-2">
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => void send({ action: "decline", reason: reason.trim() || null })}
            >
              {busy ? "Sending…" : "Decline to sign"}
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => setDeclining(false)}>
              Back
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex gap-2">
            <Button
              variant={mark === "typed" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setMark("typed")}
            >
              <TypeIcon className="size-4" aria-hidden /> Type it
            </Button>
            <Button
              variant={mark === "drawn" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setMark("drawn")}
            >
              <PenLine className="size-4" aria-hidden /> Draw it
            </Button>
          </div>

          {mark === "typed" ? (
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium" htmlFor="sign-name">
                Type your full name
              </label>
              <Input
                id="sign-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="name"
                className="text-base"
              />
            </div>
          ) : (
            <DrawPad name={name} onName={setName} onChange={setDrawn} />
          )}

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {/* ABSENT OR HONEST: the button says what is missing instead of
              sitting there greyed with no explanation. */}
          {!ready ? (
            <p className="text-sm text-muted-foreground">
              {mark === "typed"
                ? "Type your name above to sign."
                : "Draw your signature above, and type your name so it can be read back."}
            </p>
          ) : null}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              disabled={!ready || busy}
              onClick={() =>
                void send({
                  action: "sign",
                  signedName: name.trim(),
                  mark,
                  image: mark === "drawn" ? drawn : null,
                })
              }
            >
              {busy ? "Signing…" : "Sign this document"}
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => setDeclining(true)}>
              I do not want to sign this
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Signing records your name, the time, the version of this document and the device
            you signed from, on the record this document came from.
          </p>
        </div>
      )}
    </section>
  );
}

/**
 * THE DRAWING PAD. A canvas and pointer events — no library, because a signature
 * pad is four event handlers and a dependency here would be a dependency on the
 * one page that must load for a stranger on a phone signal.
 *
 * It asks for the typed name TOO, and not as a formality: VAL-10 makes the
 * signature a Value on the record, and a Value whose text is an image is a Value
 * nobody can read, search, merge into a later document or say out loud. The
 * drawing is the mark; the name is the Value.
 */
function DrawPad({
  name,
  onName,
  onChange,
}: {
  name: string;
  onName: (value: string) => void;
  onChange: (value: string | null) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const dirty = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Back the canvas at device resolution so a signature is not a stack of
    // blurred squares on the phone it was drawn on.
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.round(rect.width * ratio);
    canvas.height = Math.round(rect.height * ratio);
    const context = canvas.getContext("2d");
    if (!context) return;
    context.scale(ratio, ratio);
    context.lineWidth = 2.2;
    context.lineCap = "round";
    context.lineJoin = "round";
    // The ink is read off the page, so it is legible in light and dark alike.
    context.strokeStyle =
      getComputedStyle(canvas).getPropertyValue("color").trim() || "#111111";
  }, []);

  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const start = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    const context = canvasRef.current?.getContext("2d");
    if (!context) return;
    const { x, y } = point(event);
    context.beginPath();
    context.moveTo(x, y);
    drawing.current = true;
  };

  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const context = canvasRef.current?.getContext("2d");
    if (!context) return;
    const { x, y } = point(event);
    context.lineTo(x, y);
    context.stroke();
    dirty.current = true;
  };

  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    const canvas = canvasRef.current;
    if (!canvas || !dirty.current) return;
    onChange(canvas.toDataURL("image/png"));
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    dirty.current = false;
    onChange(null);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium">Draw your signature</span>
        <Button variant="ghost" size="sm" onClick={clear}>
          Clear
        </Button>
      </div>
      <canvas
        ref={canvasRef}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
        // `touch-none` or the browser scrolls the page instead of drawing.
        className="h-40 w-full touch-none rounded-md border border-border bg-card text-foreground"
        aria-label="Signature drawing area"
      />
      <label className="text-sm font-medium" htmlFor="sign-drawn-name">
        And type your name, so it can be read back
      </label>
      <Input
        id="sign-drawn-name"
        value={name}
        onChange={(event) => onName(event.target.value)}
        autoComplete="name"
        className="text-base"
      />
    </div>
  );
}
