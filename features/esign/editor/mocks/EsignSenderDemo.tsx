"use client";

// features/esign/editor/mocks/EsignSenderDemo.tsx — dev demo host: the REAL editor on a MOCK api.
// A banner says so (law 4); controls simulate a slow network, offline, and a second window.

import { useMemo, useState } from "react";

import { Button, Select } from "@ai-matrx/design-system/controls";
import { EsignEditor, type EditorUploader } from "../components/EsignEditor";
import { emptyDraft, newRecipient } from "../model";
import { makeDemoPdfUrl, makeMockEditorApi, type MockControls } from "./mockApi";

const PEOPLE = [
  { user_id: "u-ada", display_name: "Ada Lovelace", email: "ada@example.com" },
  { user_id: "u-grace", display_name: "Grace Hopper", email: "grace@example.com" },
  { user_id: "u-me", display_name: "Demo Sender", email: "sender@example.com" },
];

export function EsignSenderDemo() {
  const controls = useMemo<MockControls>(() => ({ saveDelayMs: 300, offline: false }), []);
  const mock = useMemo(() => makeMockEditorApi(controls), [controls]);
  const [pdfUrl] = useState(() => makeDemoPdfUrl());
  const [envelopeId, setEnvelopeId] = useState<string | null>(null);
  const [delay, setDelay] = useState("300");
  const [offline, setOffline] = useState(false);
  const [uploading, setUploading] = useState(false);
  // Starts with the sample document and two people so every state is one click away.
  const [seed] = useState(() => {
    const d = emptyDraft("Services Agreement");
    d.documents = [{ key: "doc-1", file_id: "demo-file", name: "Services Agreement.pdf", page_count: null }];
    const me = newRecipient([], { full_name: "Demo Sender", email: "sender@example.com", user_id: "u-me" });
    const ada = newRecipient([me], { full_name: "Ada Lovelace", email: "ada@example.com", user_id: "u-ada" });
    d.recipients = [me, ada];
    return d;
  });

  const uploader: EditorUploader = {
    busy: uploading,
    upload: async (file) => {
      setUploading(true);
      await new Promise((r) => setTimeout(r, 400));
      setUploading(false);
      return { file_id: "demo-file", name: file.name };
    },
    pick: (cb) => cb({ file_id: "demo-file", name: "Services Agreement.pdf" }),
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-warning/10 px-3 py-1.5 type-secondary" style={{ marginTop: "var(--shell-header-h)" }}>
        <span className="font-medium">Mock server, not real data.</span>
        <span>Save takes</span>
        <Select
          aria-label="Save takes"
          value={delay}
          options={[{ value: "300", label: "0.3 s" }, { value: "3000", label: "3 s" }, { value: "8000", label: "8 s" }]}
          onValueChange={(v) => { setDelay(v); controls.saveDelayMs = Number(v); }}
        />
        <Button variant={offline ? "danger" : "outline"} onClick={() => { controls.offline = !offline; setOffline(!offline); }}>
          {offline ? "Back online" : "Go offline"}
        </Button>
        <Button
          variant="outline"
          disabled={!envelopeId}
          onClick={() => envelopeId && mock.simulateOtherTab(envelopeId, (d) => ({ ...d, title: `${d.title} (other window)`, fields: d.fields.map((f, i) => (i === 0 ? { ...f, label: "Edited elsewhere" } : f)) }))}
        >
          Edit from another window
        </Button>
      </div>
      <div className="relative min-h-0 flex-1">
        <EsignEditor
          api={mock.api}
          mode="envelope"
          envelopeId={envelopeId}
          initial={{ draft: seed, revision: 0 }}
          organizationId="demo-org"
          people={PEOPLE}
          me={PEOPLE[2]}
          uploader={uploader}
          documentUrls={{ "demo-file": pdfUrl }}
          onCreated={(id) => setEnvelopeId(id)}
        />
      </div>
    </div>
  );
}

