"use client";

// features/esign/signing/SignedCopy.tsx — "Download signed copy", once the envelope completes.
//
// The `signed_copy` act (both doors) answers `{ granted: true, signed_copies: [{ document_id, name,
// content_base64 }] }` once the envelope is complete and the copy is made (at the last signature),
// else `{ granted: false, reason }` — `not_completed`, `preparing`, or the load door's refusal. Not ready is said in one line, with a retry — never a
// silent no-op. The bytes come back as base64 (never a URL — media-durability law) and leave as a
// download only: a blob takes our origin, so it is never opened in a frame.

import { useState } from "react";
import { Download, RotateCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ErrorNotice } from "@/components/errors/ErrorNotice";
import { useAppDispatch } from "@/lib/redux/hooks";

import { signingAct, SigningRefusal, type SigningDoor } from "./signingService";

import { Spinner } from "@/components/ui/loaders/Spinner";
import { downloadFile } from "@ai-matrx/kit/download";
interface CopyFile {
  name: string;
  base64: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The signed files in an answer, read value by value; null when the copy is not ready. */
function readCopies(answer: Record<string, unknown>): CopyFile[] | null {
  if (answer.granted !== true || !Array.isArray(answer.signed_copies)) return null;
  const files: CopyFile[] = [];
  for (const doc of answer.signed_copies) {
    if (!isRecord(doc)) continue;
    const row = doc;
    if (typeof row.content_base64 !== "string" || row.content_base64 === "") continue;
    const name = typeof row.name === "string" && row.name.trim() !== "" ? row.name : "Signed document.pdf";
    files.push({ name, base64: row.content_base64 });
  }
  return files.length > 0 ? files : null;
}

function save(file: CopyFile) {
  const binary = atob(file.base64);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  downloadFile(/\.pdf$/i.test(file.name) ? file.name : `${file.name}.pdf`, new Blob([bytes], { type: "application/octet-stream" }), "application/octet-stream");
}

export function SignedCopy({ door }: { door: SigningDoor }) {
  const dispatch = useAppDispatch();
  const [state, setState] = useState<"idle" | "busy" | "not_ready" | "waiting" | "failed">("idle");

  async function download() {
    setState("busy");
    try {
      const answer = await signingAct(dispatch, door, "signed_copy");
      const files = readCopies(answer);
      if (!files) {
        // Not everyone has signed yet, or the copy is still being made: both come right with time.
        setState(answer.reason === "not_completed" ? "waiting" : "not_ready");
        return;
      }
      for (const file of files) save(file);
      setState("idle");
    } catch (err) {
      setState(err instanceof SigningRefusal ? "not_ready" : "failed");
    }
  }

  const retry = state === "not_ready" || state === "waiting" || state === "failed";
  return (
    <div className="flex flex-col gap-2">
      <Button icon={state === "busy" ? (
          <Spinner size="xs" className="text-current" />
        ) : retry ? (
          <RotateCw />
        ) : (
          <Download />
        )} variant="primary" disabled={state === "busy"} onClick={() => void download()}>
        {retry ? "Try again" : "Download signed copy"}
      </Button>
      {state === "not_ready" && (
        <p className="type-body text-muted-foreground">Your signed copy is not ready yet.</p>
      )}
      {state === "waiting" && (
        <p className="type-body text-muted-foreground">Ready once everyone has signed.</p>
      )}
      {state === "failed" && (
        <ErrorNotice
          size="inline"
          message="We could not reach AI Matrx. Try again."
          operation="esign signed_copy"
          calls={["/esign/signing/*/act"]}
        />
      )}
    </div>
  );
}
