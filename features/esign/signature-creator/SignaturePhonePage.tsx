"use client";

// features/esign/signature-creator/SignaturePhonePage.tsx — the phone's half of the handoff.

import { useEffect, useState } from "react";
import { CheckCircle2, ImageUp, PenLine } from "lucide-react";
import { SignaturePad } from "@ai-matrx/records-ui";
import { Button, Tabs } from "@ai-matrx/design-system/controls";

import { useAppDispatch } from "@/lib/redux/hooks";
import { PAPER } from "../contract/paper";
import { fileToDataUrl, imageToInkPng } from "./render";
import { openHandoff, submitHandoff, type HandoffOpenAnswer } from "./services";

import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
type Stage = "opening" | "ready" | "sending" | "done" | "dead";
const DEAD = "This link has expired. Start again on your computer.";

export function SignaturePhonePage() {
  const dispatch = useAppDispatch();
  const [stage, setStage] = useState<Stage>("opening");
  const [secret, setSecret] = useState<string | null>(null);
  const [info, setInfo] = useState<HandoffOpenAnswer | null>(null);
  const [method, setMethod] = useState<"drawn" | "uploaded">("drawn");
  const [drawing, setDrawing] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [message, setMessage] = useState(DEAD);

  useEffect(() => {
    const match = /(?:^|[#&])h=([A-Za-z0-9_-]+)/.exec(window.location.hash);
    // The secret leaves the address bar at once (history, screenshots, shoulder-surfing).
    window.history.replaceState(null, "", window.location.pathname);
    if (!match) {
      setStage("dead");
      return;
    }
    setSecret(match[1]);
    openHandoff(dispatch, match[1])
      .then((answer) => {
        if (!answer.ok) {
          setMessage(answer.message || DEAD);
          setStage("dead");
          return;
        }
        setInfo(answer);
        if (answer.allowed && !answer.allowed.drawn && answer.allowed.uploaded) setMethod("uploaded");
        setStage("ready");
      })
      .catch(() => setStage("dead"));
  }, [dispatch]);

  const onDrawing = (url: string | null) => {
    setProblem(null);
    if (!url) return setDrawing(null);
    imageToInkPng(url)
      .then(setDrawing)
      .catch((e: unknown) => setProblem(e instanceof Error ? e.message : "Could not use that drawing."));
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setProblem(null);
    if (!/^image\/(png|jpeg)$/.test(file.type)) return setProblem("Use a PNG or JPEG image.");
    try {
      setUploaded(await imageToInkPng(await fileToDataUrl(file)));
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "That image could not be used.");
    }
  };

  const image = method === "drawn" ? drawing : uploaded;
  const done = async () => {
    if (!secret || !image) return;
    setStage("sending");
    setProblem(null);
    try {
      const answer = await submitHandoff(dispatch, { secret, method, image_data_url: image });
      if (!answer.ok) {
        setMessage(answer.message || DEAD);
        setStage("dead");
        return;
      }
      setStage("done");
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "It did not send. Try again.");
      setStage("ready");
    }
  };

  const noun = info?.target === "initials" ? "initials" : "signature";
  const who = [info?.sender_name, info?.organization_name].filter(Boolean).join(" at ");

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 px-4 pb-safe pt-6">
      {stage === "opening" && <p role="status" className="text-sm text-muted-foreground">Opening</p>}

      {stage === "dead" && (
        <p role="alert" className="rounded-md border border-border bg-card p-4 text-sm text-foreground">{message}<ErrorAlchemyMenu error={message} /></p>
      )}

      {stage === "done" && (
        <div role="status" className="flex flex-col items-center gap-3 rounded-md border border-border bg-card p-6 text-center">
          <CheckCircle2 className="size-8 text-success" aria-hidden />
          <p className="text-sm font-medium text-foreground">Sent to your computer.</p>
          <p className="text-xs text-muted-foreground">You can close this page.</p>
        </div>
      )}

      {(stage === "ready" || stage === "sending") && (
        <>
          <header className="flex flex-col gap-1">
            <h1 className="text-lg font-semibold text-foreground">
              {info?.first_name ? `${info.first_name}, add your ${noun}` : `Add your ${noun}`}
            </h1>
            {who && <p className="text-xs text-muted-foreground">For {who}</p>}
          </header>

          {info?.allowed?.drawn && info?.allowed?.uploaded && (
            <Tabs
              value={method}
              onValueChange={setMethod}
              aria-label="How to add it"
              data={[
                { value: "drawn", label: "Draw" },
                { value: "uploaded", label: "Upload" },
              ]}
            />
          )}

          {method === "drawn" ? (
            <SignaturePad value={drawing} onChange={onDrawing} disabled={stage === "sending"} />
          ) : (
            <label className="flex h-36 cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border bg-card text-sm text-muted-foreground">
              <ImageUp className="size-5" aria-hidden />
              Choose image
              <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
            </label>
          )}

          <div className="flex h-16 items-center justify-center rounded-md border border-border" style={{ background: PAPER.page }}>
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element -- a data URL this page just made
              <img src={image} alt={`Your ${noun}`} className="max-h-full max-w-full object-contain" />
            ) : (
              <span className="flex items-center gap-1 text-xs" style={{ color: PAPER.muted }}>
                <PenLine className="size-3.5" aria-hidden />
                Preview
              </span>
            )}
          </div>
          {problem && <p role="alert" className="text-xs text-destructive">{problem}<ErrorAlchemyMenu error={problem} /></p>}
          <Button variant="primary" disabled={!image || stage === "sending"} onClick={() => void done()}>
            {stage === "sending" ? "Sending" : "Done"}
          </Button>
        </>
      )}
    </main>
  );
}
