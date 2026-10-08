"use client";

// features/esign/signature-creator/SignatureCreatorBody.tsx — the creator itself (CONTRACT §14.2).
// Loaded lazily by SignatureCreatorDialog.tsx so the twelve handwriting faces never reach the
// signing page's first bundle. Every tab emits one `Candidate`; the preview shows it; Adopt returns
// it as `CreatedMark`s. One output for every tab (decision C): a transparent paper-ink PNG.

import { ErrorNotice } from "@/components/errors/ErrorNotice";
import { useCallback, useEffect, useState } from "react";
import { Button, Switch, Tabs } from "@ai-matrx/design-system/controls";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PAPER } from "../contract/paper";
import { fileToDataUrl, imageToInkPng, renderTypedPng } from "./render";
import type { SavedSignature } from "./services";
import { DEFAULT_STYLE_KEY, initialsOf, styleByKey } from "./styles";
import { DrawTab } from "./tabs/DrawTab";
import { PhoneTab } from "./tabs/PhoneTab";
import { SavedTab, Thumb } from "./tabs/SavedTab";
import { TypeTab } from "./tabs/TypeTab";
import { UploadTab } from "./tabs/UploadTab";
import type { Candidate, CreatorTab } from "./types";
import type { CreatedMark, SignatureCreatorDialogProps } from "./SignatureCreatorDialog";

import "./fonts";

function onAPhone(): boolean {
  return window.matchMedia("(pointer: coarse)").matches && window.innerWidth < 768;
}

export default function SignatureCreatorBody({
  open,
  target,
  signerName,
  initials,
  allowed,
  door,
  signedIn,
  onAdopt,
  onClose,
}: SignatureCreatorDialogProps) {
  const tabs: Array<{ value: CreatorTab; label: string }> = [];
  if (allowed.typed) tabs.push({ value: "typed", label: "Type" });
  if (allowed.drawn) tabs.push({ value: "drawn", label: "Draw" });
  if (allowed.uploaded) tabs.push({ value: "uploaded", label: "Upload" });
  if (allowed.phone && !onAPhone()) tabs.push({ value: "phone", label: "Phone" });
  if (signedIn) tabs.push({ value: "saved", label: "Saved" });

  const [tab, setTab] = useState<CreatorTab>(tabs[0]?.value ?? "typed");
  const [name, setName] = useState(signerName);
  const [ini, setIni] = useState(initials || initialsOf(signerName));
  const [styleKey, setStyleKey] = useState(DEFAULT_STYLE_KEY);
  const [candidates, setCandidates] = useState<Partial<Record<CreatorTab, Candidate | null>>>({});
  const [drawing, setDrawing] = useState<string | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [savedItem, setSavedItem] = useState<SavedSignature | null>(null);
  const [saveDefault, setSaveDefault] = useState(true);
  const [adopting, setAdopting] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const setCandidate = useCallback((which: CreatorTab, c: Candidate | null) => {
    setCandidates((prev) => ({ ...prev, [which]: c }));
  }, []);
  const phoneCandidate = useCallback((c: Candidate | null) => setCandidate("phone", c), [setCandidate]);

  // Type: re-render the PNG whenever the text or the style changes (the face is awaited inside).
  const typedText = (target === "initials" ? ini : name).trim();
  useEffect(() => {
    let live = true;
    if (!allowed.typed) return;
    if (!typedText) {
      setCandidate("typed", null);
      return;
    }
    const id = window.setTimeout(() => {
      renderTypedPng(typedText, styleByKey(styleKey))
        .then((url) => live && setCandidate("typed", { kind: "typed", source: "this_device", typed_style: styleKey, image_data_url: url, preview_url: url }))
        .catch((e: unknown) => live && setProblem(e instanceof Error ? e.message : "Could not draw that name."));
    }, 120);
    return () => {
      live = false;
      window.clearTimeout(id);
    };
  }, [typedText, styleKey, allowed.typed, setCandidate]);

  const onDrawing = (url: string | null) => {
    setDrawing(url);
    if (!url) return setCandidate("drawn", null);
    imageToInkPng(url)
      .then((png) => setCandidate("drawn", { kind: "drawn", source: "this_device", image_data_url: png, preview_url: png }))
      .catch((e: unknown) => setProblem(e instanceof Error ? e.message : "Could not use that drawing."));
  };

  const onFile = async (file: File) => {
    setUploadError(null);
    if (!/^image\/(png|jpeg)$/.test(file.type)) return setUploadError("Use a PNG or JPEG image.");
    if (file.size > 15_000_000) return setUploadError("That image is too large. Use one under 15 MB.");
    setUploadBusy(true);
    try {
      const png = await imageToInkPng(await fileToDataUrl(file));
      setCandidate("uploaded", { kind: "uploaded", source: "this_device", image_data_url: png, preview_url: png });
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "That image could not be used.");
    } finally {
      setUploadBusy(false);
    }
  };

  const candidate = candidates[tab] ?? null;

  const adopt = async () => {
    if (!candidate) return;
    setAdopting(true);
    setProblem(null);
    try {
      const base = {
        full_name: name.trim() || signerName,
        initials: ini.trim() || initialsOf(name),
        save_to_profile: signedIn && candidate.source !== "saved" && saveDefault,
        make_default: signedIn && candidate.source !== "saved" && saveDefault,
      };
      const main: CreatedMark = {
        ...base,
        target,
        kind: candidate.kind,
        source: candidate.source,
        typed_style: candidate.typed_style,
        image_data_url: candidate.image_data_url,
        handoff_id: candidate.handoff_id,
        saved_signature_id: candidate.saved_signature_id,
        preview_url: candidate.preview_url,
      };
      const marks = [main];
      // A typed signature carries matching initials in the same hand (the surface adopts both).
      if (target === "signature" && candidate.kind === "typed" && base.initials) {
        const png = await renderTypedPng(base.initials, styleByKey(candidate.typed_style));
        marks.push({ ...main, target: "initials", image_data_url: png, preview_url: png });
      }
      await onAdopt(marks);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "Could not prepare your mark.");
    } finally {
      setAdopting(false);
    }
  };

  const noun = target === "initials" ? "initials" : "signature";
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{target === "initials" ? "Create your initials" : "Create your signature"}</DialogTitle>
          <DialogDescription className="sr-only">Choose how to make your {noun}.</DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab} data={tabs} aria-label="How to create it" />

        <div className="min-h-[11rem]">
          {tab === "typed" && (
            <TypeTab
              target={target}
              name={name}
              initials={ini}
              styleKey={styleKey}
              onName={(v) => {
                setName(v);
                if (ini === initialsOf(name)) setIni(initialsOf(v));
              }}
              onInitials={setIni}
              onStyle={setStyleKey}
            />
          )}
          {tab === "drawn" && <DrawTab drawing={drawing} onDrawing={onDrawing} />}
          {tab === "uploaded" && <UploadTab onFile={(f) => void onFile(f)} busy={uploadBusy} error={uploadError} />}
          {tab === "phone" && <PhoneTab door={door} target={target} onCandidate={phoneCandidate} />}
          {tab === "saved" && (
            <SavedTab
              target={target}
              selectedId={candidates.saved?.saved_signature_id ?? null}
              onPick={(c, item) => {
                setCandidate("saved", c);
                setSavedItem(item);
              }}
            />
          )}
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Preview</span>
          <div
            className="flex h-20 items-center justify-center overflow-hidden rounded-md border border-border px-3"
            style={{ background: PAPER.page }}
            aria-live="polite"
          >
            {candidate?.preview_url ? (
              // eslint-disable-next-line @next/next/no-img-element -- a data URL this dialog just made
              <img src={candidate.preview_url} alt={`Your ${noun}`} className="max-h-full max-w-full object-contain" />
            ) : candidate && savedItem ? (
              <Thumb item={savedItem} />
            ) : (
              <span className="text-xs" style={{ color: PAPER.muted }}>
                Your {noun} appears here
              </span>
            )}
          </div>
        </div>

        {signedIn && candidate?.source !== "saved" && (
          <label className="flex items-center justify-between gap-3 text-sm text-foreground">
            Save as default
            <Switch checked={saveDefault} onCheckedChange={setSaveDefault} aria-label="Save as default" />
          </label>
        )}
        {problem && (
          <ErrorNotice size="inline" message={problem} operation="Create a signature" className="text-xs" />
        )}

        <DialogFooter>
          <Button variant="quiet" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!candidate || adopting} onClick={() => void adopt()}>
            {adopting ? "Saving…" : target === "initials" ? "Adopt initials" : "Adopt and sign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
