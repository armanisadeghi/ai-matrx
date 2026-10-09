"use client";

// features/esign/editor/components/EditorHost.tsx — the editor on the REAL server, for the app's
// routes: /esign/new (empty, or ?template= / ?copy=), /esign/<id> (a draft), and a template.

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";

import { RegionSkeleton } from "@ai-matrx/design-system/controls";
import { useFileUpload } from "@/features/files/handler/hooks/useFileUpload";
import { useUserConnections } from "@/features/messaging/hooks/useUserConnections";
import { selectActiveOrganizationId } from "@/features/scopes/redux/selectors/active-context";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectUserEmail, selectUserFullName, selectUserId } from "@/lib/redux/selectors/userSelectors";
import { ensureOrgId } from "@/lib/organizations/ensureOrgId";

import type { EnvelopeDraftV1 } from "../../contract/draft";
import { makeRealEditorApi } from "../api/realApi";
import { emptyDraft, honestVerification } from "../model";
import { readMirror } from "../useDraftSync";
import { EsignEditor, type EditorUploader, type UploadedDoc } from "./EsignEditor";

const FilePickerWindow = dynamic(
  () => import("@/features/resource-manager/resource-picker/FilePickerWindow").then((m) => ({ default: m.FilePickerWindow })),
  { ssr: false, loading: () => null },
);

const DRAFT_BASE = "/esign";
const draftHref = (id: string) => `${DRAFT_BASE}/${id}`;

type Source =
  | { kind: "new" }
  | { kind: "draft"; envelopeId: string }
  | { kind: "from_template"; templateId: string }
  | { kind: "copy"; envelopeId: string; name?: string }
  | { kind: "template"; templateId: string | null };

interface Loaded {
  envelopeId: string | null;
  draft: EnvelopeDraftV1;
  confirmed: EnvelopeDraftV1;
  revision: number;
  restored: boolean;
  template: { id: string | null; name: string; version: number } | null;
  organizationId: string | null;
}

export function EditorHost({ source }: { source: Source }) {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const api = useMemo(() => makeRealEditorApi(dispatch), [dispatch]);
  const activeOrg = useAppSelector(selectActiveOrganizationId);
  const userId = useAppSelector(selectUserId);
  const email = useAppSelector(selectUserEmail);
  const fullName = useAppSelector(selectUserFullName);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      if (source.kind === "new") {
        const d = emptyDraft();
        return { envelopeId: null, draft: d, confirmed: d, revision: 0, restored: false, template: null, organizationId: activeOrg } satisfies Loaded;
      }
      if (source.kind === "draft") {
        const got = await api.loadDraft(source.envelopeId);
        if (!got) throw new Error("You do not have access to this draft.");
        const mirror = readMirror(source.envelopeId);
        const differs = !!mirror && JSON.stringify(mirror.draft) !== JSON.stringify(got.composition);
        return {
          envelopeId: source.envelopeId,
          draft: honestVerification(differs && mirror ? mirror.draft : got.composition),
          confirmed: got.composition,
          revision: got.revision,
          restored: differs,
          template: null,
          organizationId: got.organizationId || activeOrg,
        } satisfies Loaded;
      }
      if (source.kind === "from_template" || source.kind === "copy") {
        // A draft from a template carries the template's name and organization (its own, not a guess).
        const source_template = source.kind === "from_template" ? await api.getTemplate(source.templateId) : null;
        const organizationId = source_template?.organizationId || activeOrg || (await ensureOrgId(null));
        const made = await api.createDraft({
          organizationId,
          title: source_template?.name ?? (source.kind === "copy" && source.name ? `Copy of ${source.name}` : ""),
          templateId: source.kind === "from_template" ? source.templateId : undefined,
          copyOfEnvelopeId: source.kind === "copy" ? source.envelopeId : undefined,
        });
        window.history.replaceState(null, "", draftHref(made.envelopeId));
        return { envelopeId: made.envelopeId, draft: honestVerification(made.composition), confirmed: made.composition, revision: made.revision, restored: false, template: null, organizationId } satisfies Loaded;
      }
      if (source.templateId) {
        const t = await api.getTemplate(source.templateId);
        if (!t) throw new Error("You do not have access to this template.");
        // A template carries no access codes: every recipient starts without one (the editor asks).
        const draft: EnvelopeDraftV1 = honestVerification({ ...t.composition, recipients: t.composition.recipients.map((r) => ({ ...r, has_access_code: false })) });
        return { envelopeId: null, draft, confirmed: draft, revision: 0, restored: false, template: { id: t.id, name: t.name, version: t.version }, organizationId: t.organizationId } satisfies Loaded;
      }
      const d = emptyDraft();
      return { envelopeId: null, draft: d, confirmed: d, revision: 0, restored: false, template: { id: null, name: "", version: 0 }, organizationId: activeOrg } satisfies Loaded;
    })()
      .then(setLoaded)
      .catch((err: unknown) => setFailed(err instanceof Error ? err.message : "This could not be opened."));
  }, [api, activeOrg, source]);

  const { connections } = useUserConnections((loaded?.organizationId ?? activeOrg) ? { organizationId: (loaded?.organizationId ?? activeOrg) as string } : {});
  const people = useMemo(() => connections.map((c) => ({ user_id: c.user_id, display_name: c.display_name ?? null, email: c.email ?? null })), [connections]);
  const me = useMemo(() => (userId ? { user_id: userId, display_name: fullName ?? null, email: email ?? null } : null), [userId, fullName, email]);

  const { upload, uploading } = useFileUpload();
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickCb = useRef<((doc: UploadedDoc) => void) | null>(null);
  const uploader: EditorUploader = {
    busy: uploading,
    upload: async (file) => {
      const out = await upload({ kind: "file", file }, { folderPath: "E-Signatures" });
      if (!out.fileId) throw new Error(`${file.name} could not be uploaded.`);
      return { file_id: out.fileId, name: file.name };
    },
    pick: (cb) => {
      pickCb.current = cb;
      setPickerOpen(true);
    },
  };

  if (failed) {
    return <div className="flex h-full items-center justify-center px-6 text-center type-body text-muted-foreground">{failed}</div>;
  }
  if (!loaded) {
    return (
      <div className="p-6">
        <RegionSkeleton />
      </div>
    );
  }

  return (
    <>
      <EsignEditor
        api={api}
        mode={source.kind === "template" ? "template" : "envelope"}
        envelopeId={loaded.envelopeId}
        initial={{ draft: loaded.draft, revision: loaded.revision, confirmed: loaded.confirmed }}
        template={loaded.template}
        organizationId={loaded.organizationId}
        resolveOrganizationId={() => ensureOrgId(null)}
        people={people}
        me={me}
        uploader={uploader}
        restoredNotice={loaded.restored}
        backHref={source.kind === "template" ? "/esign/templates" : "/esign"}
        onCreated={(id) => window.history.replaceState(null, "", draftHref(id))}
        onTemplateSaved={(id) => source.kind === "template" && !source.templateId && router.replace(`/esign/templates/${id}`)}
      />
      <FilePickerWindow
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        scopeId="esign-editor-documents"
        title="Choose a PDF"
        initialFilter="pdfs"
        onPick={(selection) => {
          pickCb.current?.({ file_id: selection.fileId, name: selection.details.filename || "Document.pdf" });
          return "close";
        }}
      />
    </>
  );
}
