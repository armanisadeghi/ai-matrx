"use client";

// features/esign/editor/components/EnvelopeRoute.tsx — /esign/<id>: a draft opens the editor; a sent
// envelope opens its page. The envelope row says which (status).

import { useEffect, useMemo, useState } from "react";

import { RegionSkeleton } from "@ai-matrx/design-system/controls";
import { useAppDispatch } from "@/lib/redux/hooks";
import { EnvelopeDetail } from "@/features/esign/envelopes/EnvelopeDetail";
import { makeRealEditorApi } from "../api/realApi";
import { EditorHost } from "./EditorHost";

export function EnvelopeRoute({ envelopeId }: { envelopeId: string }) {
  const dispatch = useAppDispatch();
  const api = useMemo(() => makeRealEditorApi(dispatch), [dispatch]);
  const [status, setStatus] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let live = true;
    api
      .loadDraft(envelopeId)
      .then((got) => live && setStatus(got ? got.status : null))
      .catch(() => live && setStatus(null));
    return () => {
      live = false;
    };
  }, [api, envelopeId]);

  if (status === undefined) {
    return (
      <div className="p-6">
        <RegionSkeleton />
      </div>
    );
  }
  if (status === "draft") return <EditorHost source={{ kind: "draft", envelopeId }} />;
  return <EnvelopeDetail envelopeId={envelopeId} />;
}
