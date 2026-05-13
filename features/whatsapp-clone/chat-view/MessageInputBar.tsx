"use client";

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";
import dynamic from "next/dynamic";
import { Mic, Send, Smile, Square, Trash2 } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useSimpleRecorder } from "@/features/audio/hooks/useSimpleRecorder";
import { useFileUpload } from "@/features/files";
import { toast } from "sonner";
import { cn } from "@/styles/themes/utils";
import { MessageInputAttachMenu } from "./MessageInputAttachMenu";
import type { SendMessageOptions } from "../hooks/useWhatsAppChat";
import { formatDuration } from "../shared/relative-time";

// emoji-picker-react ships as default-export; load client-side only
const EmojiPicker = dynamic(() => import("emoji-picker-react"), { ssr: false });

interface MessageInputBarProps {
  conversationId: string;
  onSend: (content: string, options?: SendMessageOptions) => Promise<void>;
  disabled?: boolean;
}

export function MessageInputBar({
  conversationId,
  onSend,
  disabled,
}: MessageInputBarProps) {
  const [value, setValue] = useState("");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const trimmed = value.trim();

  const { upload } = useFileUpload();

  const recorder = useSimpleRecorder({
    onRecordingComplete: async (blob) => {
      try {
        setIsUploading(true);
        const ext = blob.type.includes("ogg") ? "ogg" : "webm";
        const file = new File([blob], `voice-${Date.now()}.${ext}`, {
          type: blob.type || "audio/webm",
        });
        const normalized = await upload(
          { kind: "file", file },
          {
            folderPath: `messages/${conversationId}`,
            visibility: "private",
            metadata: {
              kind: "voice_message",
              duration_sec: recorder.duration,
            },
          },
        );
        const url = normalized.url;
        await onSend("", {
          message_type: "audio",
          media_url: url ?? undefined,
          media_metadata: {
            duration_sec: recorder.duration,
            mime_type: file.type,
            file_size: normalized.meta.sizeBytes ?? blob.size,
            file_id: normalized.fileId,
          },
        });
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Failed to send voice message",
        );
      } finally {
        setIsUploading(false);
      }
    },
    onError: (err) => toast.error(err),
  });

  // Keep textarea height tight to content
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }, [value]);

  const submit = async () => {
    if (!trimmed || disabled) return;
    const content = trimmed;
    setValue("");
    try {
      await onSend(content);
    } catch (err) {
      setValue(content);
      toast.error(
        err instanceof Error ? err.message : "Failed to send message",
      );
    }
  };

  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  };

  const insertEmoji = (emoji: string) => {
    const el = textareaRef.current;
    if (!el) {
      setValue((v) => v + emoji);
      return;
    }
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const next = value.slice(0, start) + emoji + value.slice(end);
    setValue(next);
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = el.selectionEnd = start + emoji.length;
    });
  };

  const handleAttachPick = (kind: "image" | "video" | "file") => {
    if (kind === "file") docInputRef.current?.click();
    else photoInputRef.current?.click();
  };

  const uploadAndSendFile = async (
    file: File,
    kind: "image" | "video" | "file",
  ) => {
    setIsUploading(true);
    try {
      const normalized = await upload(
        { kind: "file", file },
        {
          folderPath: `messages/${conversationId}`,
          visibility: "private",
          metadata: { kind: `chat_${kind}` },
        },
      );
      const url = normalized.url;
      await onSend("", {
        message_type: kind,
        media_url: url ?? undefined,
        media_metadata: {
          file_name: file.name,
          file_size: normalized.meta.sizeBytes ?? file.size,
          mime_type: file.type,
          file_id: normalized.fileId,
        },
      });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to upload attachment",
      );
    } finally {
      setIsUploading(false);
    }
  };

  const handlePhotoChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ""; // allow re-pick same file
    for (const file of files) {
      const kind: "image" | "video" = file.type.startsWith("video/")
        ? "video"
        : "image";
      await uploadAndSendFile(file, kind);
    }
  };

  const handleDocChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    for (const file of files) await uploadAndSendFile(file, "file");
  };

  const startRecording = async () => {
    setEmojiOpen(false);
    await recorder.startRecording();
  };
  const stopAndSend = () => recorder.stopRecording();
  const cancelRecording = () => recorder.reset();

  if (recorder.isRecording) {
    return (
      <div className="flex h-[60px] shrink-0 items-center gap-3 border-t border-border bg-muted px-4">
        <button
          type="button"
          onClick={cancelRecording}
          aria-label="Cancel recording"
          className="flex h-10 w-10 items-center justify-center rounded-full text-rose-500 hover:bg-accent"
        >
          <Trash2 className="h-5 w-5" />
        </button>
        <div className="flex flex-1 items-center gap-3">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-rose-500" />
          <span className="font-mono text-[14px] tabular-nums text-foreground">
            {formatDuration(recorder.duration)}
          </span>
          <div className="flex h-7 flex-1 items-center gap-[2px]">
            {Array.from({ length: 48 }).map((_, i) => {
              const phase = (i + Math.floor(recorder.duration * 4)) % 48;
              const intensity = Math.sin((phase / 48) * Math.PI) ** 2;
              const h =
                4 + Math.round(20 * intensity * (0.4 + recorder.audioLevel));
              return (
                <span
                  key={i}
                  className="w-[2px] rounded-full bg-emerald-500"
                  style={{ height: `${h}px` }}
                />
              );
            })}
          </div>
        </div>
        <button
          type="button"
          onClick={stopAndSend}
          aria-label="Stop and send"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500 text-white hover:bg-emerald-600"
        >
          <Square className="h-4 w-4 fill-current" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex shrink-0 items-end gap-1.5 border-t border-border bg-muted px-3 py-2.5">
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        className="hidden"
        onChange={handlePhotoChange}
      />
      <input
        ref={docInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleDocChange}
      />

      <MessageInputAttachMenu onPick={handleAttachPick} />

      <Popover open={emojiOpen} onOpenChange={setEmojiOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Emoji"
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
              emojiOpen && "bg-accent text-foreground",
            )}
          >
            <Smile className="h-6 w-6" strokeWidth={1.75} />
          </button>
        </PopoverTrigger>
        <PopoverContent
          side="top"
          align="start"
          sideOffset={12}
          className="w-auto border-border bg-popover p-0"
        >
          <EmojiPicker
            onEmojiClick={(d) => insertEmoji(d.emoji)}
            width={340}
            height={400}
            theme={
              typeof document !== "undefined" &&
              document.documentElement.classList.contains("dark")
                ? ("dark" as never)
                : ("light" as never)
            }
            lazyLoadEmojis
            previewConfig={{ showPreview: false }}
          />
        </PopoverContent>
      </Popover>

      <div className="flex min-w-0 flex-1 items-end rounded-lg bg-card px-3 py-2">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKey}
          rows={1}
          placeholder={isUploading ? "Uploading…" : "Type a message"}
          aria-label="Message"
          disabled={disabled || isUploading}
          className="max-h-32 w-full resize-none bg-transparent text-[15px] leading-5 text-foreground placeholder:text-muted-foreground focus:outline-none"
        />
      </div>

      {trimmed ? (
        <button
          type="button"
          onClick={submit}
          aria-label="Send"
          className="flex h-10 w-10 items-center justify-center rounded-full text-emerald-600 transition-colors hover:bg-accent dark:text-emerald-400"
        >
          <Send className="h-5 w-5 -rotate-12" strokeWidth={2} />
        </button>
      ) : (
        <button
          type="button"
          onClick={startRecording}
          aria-label="Record voice message"
          disabled={isUploading}
          className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Mic className="h-5 w-5" strokeWidth={1.75} />
        </button>
      )}
    </div>
  );
}
