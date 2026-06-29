"use client";

import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  FileAudio,
  CheckCircle2,
  AlertTriangle,
  Upload,
  Mic,
} from "lucide-react";
import { useAudioTranscription } from "@/features/audio/hooks/useAudioTranscription";
import { useTranscriptsContext } from "../context/TranscriptsContext";
import { useToastManager } from "@/hooks/useToastManager";
import {
  FileUploadWithStorage,
  UploadedFileResult,
} from "@/components/ui/file-upload/FileUploadWithStorage";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { supabase } from "@/utils/supabase/client";
import { RecordingInterface } from "./RecordingInterface";
import { RecordingPreview } from "./RecordingPreview";
import { saveAudioToStorage, getAudioUrl, downloadAudioBlob } from "../service/audioStorageService";
import { saveDraftTranscript } from "../service/transcriptsService";
import { TranscriptSegment } from "../types";
import { requireUserId } from "@/utils/auth/getUserId";

interface CreateTranscriptModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type InputMethod = "upload" | "record";
type Step =
  | "choose"
  | "upload"
  | "record"
  | "saving-audio"
  | "details"
  | "process"
  | "preview";

const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

export function CreateTranscriptModal({
  isOpen,
  onClose,
}: CreateTranscriptModalProps) {
  const { createTranscript, refreshTranscripts } = useTranscriptsContext();
  const {
    transcribe,
    isTranscribing,
    error: transcribeError,
    reset: resetTranscription,
  } = useAudioTranscription();
  const toast = useToastManager("transcripts");

  const [inputMethod, setInputMethod] = useState<InputMethod>("upload");
  const [step, setStep] = useState<Step>("choose");

  // Upload-related state
  const [uploadedFile, setUploadedFile] = useState<UploadedFileResult | null>(
    null,
  );

  // Recording-related state
  const [recordedAudioBlob, setRecordedAudioBlob] = useState<Blob | null>(null);
  const [recordedDuration, setRecordedDuration] = useState(0);
  const [audioStoragePath, setAudioStoragePath] = useState<string | null>(null);
  const [draftTranscriptId, setDraftTranscriptId] = useState<string | null>(
    null,
  );
  const [uploadProgress, setUploadProgress] = useState({
    percent: 0,
    status: "",
  });

  // Transcription state
  const [transcriptSegments, setTranscriptSegments] = useState<
    TranscriptSegment[]
  >([]);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  // Form State
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [folder, setFolder] = useState("Recordings");
  const [sourceType, setSourceType] = useState<
    "audio" | "video" | "meeting" | "interview" | "other"
  >("audio");
  const [isSaving, setIsSaving] = useState(false);

  // Reset when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      // Delay reset to allow animation to finish
      const timer = setTimeout(() => {
        setInputMethod("upload");
        setStep("choose");
        setUploadedFile(null);
        setRecordedAudioBlob(null);
        setRecordedDuration(0);
        setAudioStoragePath(null);
        setDraftTranscriptId(null);
        setTranscriptSegments([]);
        setAudioUrl(null);
        setTitle("");
        setDescription("");
        setFolder("Recordings");
        setSourceType("audio");
        setIsSaving(false);
        setUploadProgress({ percent: 0, status: "" });
        resetTranscription();
        // Session backup replaced by IndexedDB safety store
      }, 300);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [isOpen, resetTranscription]);

  const handleUploadComplete = (results: UploadedFileResult[]) => {
    if (results.length > 0) {
      const file = results[0];
      setUploadedFile(file);

      // Auto-populate title if empty
      if (!title && file.details?.filename) {
        // Remove extension
        const name = file.details.filename.replace(/\.[^/.]+$/, "");
        setTitle(name.charAt(0).toUpperCase() + name.slice(1));
      }

      // Move to details step
      setStep("details");
    }
  };

  // ============ RECORDING HANDLERS ============

  const handleRecordingComplete = async (audioBlob: Blob, duration: number) => {
    try {
      // Validate that we have audio
      if (!audioBlob || audioBlob.size === 0) {
        toast.error("Recording failed: No audio data captured");
        setStep("record");
        return;
      }

      // Store recording in state and backup to session
      setRecordedAudioBlob(audioBlob);
      setRecordedDuration(duration);
      // Generate default title
      const now = new Date();
      setTitle(`Recording - ${now.toLocaleString()}`);

      // Move to saving audio step
      setStep("saving-audio");

      // CRITICAL STEP 1: Save audio to storage FIRST (NEVER skip this)
      const userId = requireUserId();

      const uploadResult = await saveAudioToStorage(
        audioBlob,
        userId,
        (percent, status) => {
          setUploadProgress({ percent, status });
        },
      );

      setAudioStoragePath(uploadResult.fileId);

      // Get a signed URL for preview through the universal handler.
      const previewUrl = await getAudioUrl(uploadResult.fileId);
      setAudioUrl(previewUrl);

      // CRITICAL STEP 2: Transcribe the audio
      setStep("process");

      // Download the audio we just uploaded to send to Groq
      const audioData = await downloadAudioBlob(uploadResult.fileId);

      const result = await transcribe(audioData);

      if (!result.success || !result.text) {
        throw new Error(result.error || "Transcription failed to produce text");
      }

      // Convert transcription result to segments
      const segments: TranscriptSegment[] = (result.segments || []).map(
        (s: any) => ({
          id: s.id?.toString() || crypto.randomUUID(),
          timecode: formatTime(s.start || 0),
          seconds: s.start || 0,
          text: s.text || "",
          speaker: "Speaker",
        }),
      );

      setTranscriptSegments(segments);

      // CRITICAL STEP 3: Save draft to database IMMEDIATELY
      const draft = await saveDraftTranscript({
        title,
        description,
        segments,
        folder_name: folder,
        source_type: "audio",
        tags: [],
        metadata: {
          duration: result.duration || duration,
          language: result.language,
        },
        audio_file_path: uploadResult.fileId,
      });

      setDraftTranscriptId(draft.id);
      // Audio safety handled by IndexedDB store

      // Refresh to show the new draft in the sidebar
      await refreshTranscripts();

      // Move to preview step
      setStep("preview");
      toast.success("Recording saved as draft");
    } catch (error: any) {
      console.error("Recording processing failed:", error);
      toast.error(error.message || "Failed to process recording");
      // Audio is still in audioBlob and session backup
      setStep("record"); // Go back to recording
    }
  };

  const handleRecordingError = (error: string, code: string) => {
    toast.error(error);
    setStep("record");
  };

  const handleFinalizeDraft = async () => {
    if (!draftTranscriptId) return;

    setIsSaving(true);
    try {
      const { finalizeDraft } = await import("../service/transcriptsService");
      await finalizeDraft(draftTranscriptId, {
        title,
        description,
        segments: transcriptSegments,
        folder_name: folder,
        source_type: sourceType,
      });

      toast.success("Transcript finalized successfully");
      await refreshTranscripts();
      onClose();
    } catch (error: any) {
      console.error("Failed to finalize draft:", error);
      toast.error(error.message || "Failed to finalize transcript");
    } finally {
      setIsSaving(false);
    }
  };

  const handleStartProcessing = async () => {
    if (!uploadedFile) return;

    setStep("process");

    try {
      // 1. Download the audio bytes via the universal file handler.
      let audioBlob: Blob;

      if (uploadedFile.fileId) {
        audioBlob = await downloadAudioBlob(uploadedFile.fileId);
      } else if (uploadedFile.url) {
        const response = await fetch(uploadedFile.url);
        if (!response.ok)
          throw new Error("Failed to download audio for transcription");
        audioBlob = await response.blob();
      } else {
        throw new Error("No fileId or URL available");
      }

      // 2. Transcribe
      const result = await transcribe(audioBlob);

      if (!result.success || !result.text) {
        throw new Error(result.error || "Transcription failed to produce text");
      }

      // 3. Save to DB
      await createTranscript({
        title: title.trim() || "Untitled Transcript",
        description: description.trim(),
        segments: (result.segments || []).map((s: any) => ({
          id: s.id?.toString() || crypto.randomUUID(),
          timecode: formatTime(s.start || 0),
          seconds: s.start || 0,
          text: s.text || "",
          speaker: "Unknown",
        })),
        folder_name: folder,
        source_type: sourceType,
        tags: [],
        metadata: {
          duration: result.duration,
          language: result.language,
        },
        audio_file_path: uploadedFile.fileId ?? null,
      });

      toast.success("Transcript created successfully");
      await refreshTranscripts();
      onClose();
    } catch (error: any) {
      console.error("Processing failed:", error);
      toast.error(error.message || "Failed to process transcript");
    }
  };

  const handleSaveWithoutTranscription = async () => {
    if (!uploadedFile) return;
    setIsSaving(true);
    try {
      await createTranscript({
        title: title.trim() || "Untitled Transcript",
        description: description.trim(),
        segments: [],
        folder_name: folder,
        source_type: sourceType,
        tags: [],
        audio_file_path: uploadedFile.fileId ?? null,
      });
      toast.success("Transcript saved (without transcription)");
      await refreshTranscripts();
      onClose();
    } catch (error: any) {
      console.error("Save failed:", error);
      toast.error("Failed to save transcript");
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-xl max-h-[90dvh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileAudio className="h-5 w-5" />
            Create New Transcript
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-4">
          {/* Step: Choose Method */}
          {step === "choose" && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground text-center mb-4">
                Choose how you'd like to create your transcript:
              </p>
              <Button
                onClick={() => {
                  setInputMethod("upload");
                  setStep("upload");
                }}
                className="w-full h-auto py-6 flex-col gap-2"
                variant="outline"
              >
                <Upload className="h-6 w-6" />
                <div>
                  <div className="font-semibold">Upload File</div>
                  <div className="text-xs text-muted-foreground font-normal">
                    Upload an audio or video file
                  </div>
                </div>
              </Button>
              <Button
                onClick={() => {
                  setInputMethod("record");
                  setStep("record");
                }}
                className="w-full h-auto py-6 flex-col gap-2"
                variant="outline"
              >
                <Mic className="h-6 w-6" />
                <div>
                  <div className="font-semibold">Record Audio</div>
                  <div className="text-xs text-muted-foreground font-normal">
                    Record directly in your browser
                  </div>
                </div>
              </Button>
            </div>
          )}

          {/* Step 1: Upload */}
          {step === "upload" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-muted-foreground">
                  Upload an audio or video file
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setStep("choose")}
                  className="text-xs"
                >
                  ← Back
                </Button>
              </div>

              <FileUploadWithStorage
                path="Transcripts/Uploads"
                saveTo="private"
                onUploadComplete={handleUploadComplete}
                multiple={false}
                useMiniUploader={false}
                maxHeight="250px"
              />
            </div>
          )}

          {/* Step 2: Record Audio */}
          {step === "record" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-muted-foreground">
                  Record audio directly
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setStep("choose")}
                  className="text-xs"
                >
                  ← Back
                </Button>
              </div>

              <RecordingInterface
                onRecordingComplete={handleRecordingComplete}
                onError={handleRecordingError}
              />
            </div>
          )}

          {/* Step: Saving Audio */}
          {step === "saving-audio" && (
            <div className="flex flex-col items-center justify-center py-12 space-y-6">
              <div className="relative">
                <div className="h-24 w-24 rounded-full border-4 border-t-primary border-r-primary/50 border-b-primary/20 border-l-primary/20 animate-spin"></div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <FileAudio className="h-10 w-10 text-primary animate-pulse" />
                </div>
              </div>
              <div className="text-center space-y-2 max-w-md">
                <h3 className="text-lg font-semibold">
                  {uploadProgress.status || "Saving Audio..."}
                </h3>
                <p className="text-sm text-muted-foreground">
                  Securing your audio file to storage. This ensures your
                  recording is never lost.
                </p>
                {uploadProgress.percent > 0 && (
                  <p className="text-xs text-primary font-mono">
                    {uploadProgress.percent}% complete
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Step 2: Details */}
          {step === "details" && (
            <div className="space-y-4">
              <Alert className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 mb-4">
                <CheckCircle2 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <AlertTitle>File Uploaded</AlertTitle>
                <AlertDescription className="text-blue-800 dark:text-blue-300 text-xs">
                  {uploadedFile?.details?.filename} (
                  {(uploadedFile?.details?.size || 0) / 1024 < 1024
                    ? `${Math.round((uploadedFile?.details?.size || 0) / 1024)} KB`
                    : `${((uploadedFile?.details?.size || 0) / 1024 / 1024).toFixed(1)} MB`}
                  )
                </AlertDescription>
              </Alert>

              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Transcript Title"
                  className="border border-border"
                  style={{ fontSize: "16px" }}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Add a description..."
                  rows={2}
                  className="border border-border"
                  style={{ fontSize: "16px" }}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="source-type">Source Type</Label>
                  <Select
                    value={sourceType}
                    onValueChange={(v: any) => setSourceType(v)}
                  >
                    <SelectTrigger id="source-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="audio">Audio Recording</SelectItem>
                      <SelectItem value="video">Video Recording</SelectItem>
                      <SelectItem value="meeting">Meeting</SelectItem>
                      <SelectItem value="interview">Interview</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="folder">Folder</Label>
                  <Input
                    id="folder"
                    value={folder}
                    onChange={(e) => setFolder(e.target.value)}
                    placeholder="Folder Name"
                    style={{ fontSize: "16px" }}
                    className="border border-border"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step: Preview Recording */}
          {step === "preview" && audioUrl && (
            <div className="space-y-4">
              <Alert className="bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
                <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                <AlertTitle>Draft Saved!</AlertTitle>
                <AlertDescription className="text-green-800 dark:text-green-300 text-xs">
                  Your recording and transcript have been safely saved as a
                  draft. You can now edit the details and finalize it, or close
                  this window and return later.
                </AlertDescription>
              </Alert>

              <RecordingPreview
                audioUrl={audioUrl}
                title={title}
                description={description}
                segments={transcriptSegments}
                onTitleChange={setTitle}
                onDescriptionChange={setDescription}
                onSegmentsChange={setTranscriptSegments}
              />

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="preview-source-type">Source Type</Label>
                  <Select
                    value={sourceType}
                    onValueChange={(v: any) => setSourceType(v)}
                  >
                    <SelectTrigger
                      id="preview-source-type"
                      className="border border-border"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="audio">Audio Recording</SelectItem>
                      <SelectItem value="video">Video Recording</SelectItem>
                      <SelectItem value="meeting">Meeting</SelectItem>
                      <SelectItem value="interview">Interview</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="preview-folder">Folder</Label>
                  <Input
                    id="preview-folder"
                    value={folder}
                    onChange={(e) => setFolder(e.target.value)}
                    placeholder="Folder Name"
                    style={{ fontSize: "16px" }}
                    className="border border-border"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Processing */}
          {step === "process" && (
            <div className="flex flex-col items-center justify-center py-8 space-y-6">
              {transcribeError ? (
                <div className="text-center space-y-4 max-w-md mx-auto">
                  <div className="h-16 w-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto text-red-600 dark:text-red-400">
                    <AlertTriangle className="h-8 w-8" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-red-600 dark:text-red-400">
                      Transcription Failed
                    </h3>
                    <p className="text-sm text-gray-500 mt-2">
                      {transcribeError}
                    </p>
                  </div>
                  <div className="flex gap-2 justify-center">
                    <Button
                      variant="outline"
                      onClick={() => setStep("details")}
                    >
                      Go Back
                    </Button>
                    <Button
                      variant="default"
                      onClick={handleSaveWithoutTranscription}
                      disabled={isSaving}
                    >
                      {isSaving && (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      )}
                      Save Without Transcription
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="relative">
                    {/* Outer rotating ring */}
                    <div className="h-24 w-24 rounded-full border-4 border-t-primary border-r-primary/50 border-b-primary/20 border-l-primary/20 animate-spin"></div>
                    {/* Inner pulsing circle */}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="h-16 w-16 rounded-full bg-primary/10 animate-pulse flex items-center justify-center">
                        <FileAudio className="h-8 w-8 text-primary" />
                      </div>
                    </div>
                  </div>
                  <div className="text-center space-y-2 max-w-md">
                    <h3 className="text-lg font-semibold">
                      Transcribing Audio...
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Processing{" "}
                      <span className="font-medium text-foreground">
                        {uploadedFile?.details?.filename}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Using Groq Whisper Large V3 Turbo for lightning-fast
                      results
                    </p>
                  </div>
                  {/* Progress dots animation */}
                  <div className="flex gap-1.5">
                    <div
                      className="h-2 w-2 rounded-full bg-primary animate-bounce"
                      style={{ animationDelay: "0ms" }}
                    ></div>
                    <div
                      className="h-2 w-2 rounded-full bg-primary animate-bounce"
                      style={{ animationDelay: "150ms" }}
                    ></div>
                    <div
                      className="h-2 w-2 rounded-full bg-primary animate-bounce"
                      style={{ animationDelay: "300ms" }}
                    ></div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          {(step === "upload" || step === "record") && (
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
          )}
          {step === "details" && (
            <>
              <Button variant="ghost" onClick={() => setStep("upload")}>
                Back
              </Button>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={handleSaveWithoutTranscription}
                  disabled={isSaving}
                  className="min-w-[120px]"
                >
                  {isSaving && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Upload Only
                </Button>
                <Button
                  onClick={handleStartProcessing}
                  disabled={isSaving}
                  className="min-w-[160px]"
                >
                  <FileAudio className="mr-2 h-4 w-4" />
                  Upload & Transcribe
                </Button>
              </div>
            </>
          )}
          {step === "preview" && (
            <>
              <Button variant="ghost" onClick={onClose}>
                Close (Draft Saved)
              </Button>
              <Button
                onClick={handleFinalizeDraft}
                disabled={isSaving}
                className="min-w-[140px]"
              >
                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Finalize Transcript
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
