"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system";
import { Label } from "@/components/ui/label";
import { ProTextarea } from "@/components/official/ProTextarea";
import { openFilePicker } from "@/features/files/components/pickers/cloudFilesPickerOpeners";
import { getFileMetadata } from "@/features/files/api/files";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { createEducationAudioStudyScope } from "@/features/surfaces/manifests/education-audio-study.manifest";
import { audioWriteHandlers, createAudioStudy, parseAudioUpdate, updateAudioStudy } from "../audioWrites";
import type { StudyMediaRow } from "../../types";

export function AudioStudyEditor({ media: initialMedia }: { media?: StudyMediaRow }) {
  const router = useRouter();
  const [media, setMedia] = useState(initialMedia);
  const [title, setTitle] = useState(media?.title ?? "");
  const [description, setDescription] = useState(media?.description ?? "");
  const [fileId, setFileId] = useState<string | undefined>();
  const [fileName, setFileName] = useState("");
  const [baseVersion, setBaseVersion] = useState(media?.version);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = title !== (media?.title ?? "") || description !== (media?.description ?? "") || !!fileId;
  const draftKey = `audio-study-draft:${media?.id ?? "new"}`;
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      const stored = sessionStorage.getItem(draftKey);
      if (!active || !stored) return;
      try {
        const draft = JSON.parse(stored);
        if (typeof draft.title !== "string" || typeof draft.description !== "string") throw new Error("Invalid saved draft");
        setTitle(draft.title); setDescription(draft.description); setFileId(draft.fileId); setFileName(draft.fileName ?? ""); setBaseVersion(draft.baseVersion);
        toast.info("Your unsaved audio study was restored.");
      } catch { sessionStorage.removeItem(draftKey); }
    });
    return () => { active = false; };
  }, [draftKey]);
  useEffect(() => {
    if (!dirty) return;
    sessionStorage.setItem(draftKey, JSON.stringify({ title, description, fileId, fileName, baseVersion }));
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [draftKey, dirty, title, description, fileId, fileName, baseVersion]);
  function changeField(field: "title" | "description", value: string) {
    const nextTitle = field === "title" ? value : title;
    const nextDescription = field === "description" ? value : description;
    if (nextTitle === (media?.title ?? "") && nextDescription === (media?.description ?? "") && !fileId) sessionStorage.removeItem(draftKey);
    if (field === "title") setTitle(value); else setDescription(value);
  }
  function onAgentSaved(row: StudyMediaRow) {
    if (row.id === media?.id) {
      setMedia(row); setTitle(row.title); setDescription(row.description ?? ""); setBaseVersion(row.version); setFileId(undefined); setFileName("");
      sessionStorage.removeItem(draftKey);
    }
    toast.success(`Saved ${row.title}. Open it from Audio Study.`);
  }
  async function pickFile() {
    try {
      const files = await openFilePicker({ title: media ? "Replace recording" : "Choose audio", allowedExtensions: ["mp3", "wav", "m4a", "ogg", "aac", "flac"], multi: false });
      if (!files?.[0]) return;
      const { data } = await getFileMetadata(files[0]);
      setFileId(data.id); setFileName(data.file_name);
      if (!title) setTitle(data.file_name);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not choose audio."); }
  }
  async function save() {
    setSaving(true); setError(null);
    try {
      const row = media ? await updateAudioStudy(parseAudioUpdate({ id: media.id, expected_version: baseVersion, title, description, ...(fileId ? { audio_file_id: fileId } : {}) }, [media]))
        : await createAudioStudy({ title, description, fileId: fileId ?? "" });
      sessionStorage.removeItem(draftKey);
      router.push(`/education/audio-study/${row.id}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save audio study."); }
    finally { setSaving(false); }
  }
  return <SurfaceRuntimeProvider surfaceName="matrx-user/education-audio-study"
    getScope={() => createEducationAudioStudyScope({ view: media ? "detail" : "new", record_loaded: !!media, audio_id: media?.id, audio_title: title, audio_version: media?.version })}
    getWriteHandlers={() => audioWriteHandlers(media ? [media] : [], onAgentSaved, () => router.push("/education/audio-study"), () => { if (dirty || saving) throw new Error("Save or cancel your edits before applying agent changes."); })}>
    <div className="matrx-touch-targets mx-auto w-full max-w-2xl space-y-5 p-4">
      <h1 className="text-lg font-semibold">{media ? "Edit audio study" : "Add audio study"}</h1>
      <div className="space-y-1"><Label htmlFor="audio-title">Title</Label><Input id="audio-title" value={title} onChange={(event) => changeField("title", event.target.value)} /></div>
      <div className="space-y-1"><Label htmlFor="audio-description">Description</Label><ProTextarea id="audio-description" value={description} onChange={(event) => changeField("description", event.target.value)} /></div>
      <Button variant="outline" onClick={() => void pickFile()}>{media ? "Replace recording" : "Choose audio file"}</Button>
      {fileName && <p className="text-sm text-muted-foreground">{fileName}</p>}
      {media && fileId && <p className="text-sm text-muted-foreground">The replacement recording will use its own provenance. The original generated citations will be cleared.</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}<ErrorAlchemyMenu error={error} /></p>}
      <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => { sessionStorage.removeItem(draftKey); router.push(media ? `/education/audio-study/${media.id}` : "/education/audio-study"); }}>Cancel</Button><Button disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : "Save audio study"}</Button></div>
    </div>
  </SurfaceRuntimeProvider>;
}
