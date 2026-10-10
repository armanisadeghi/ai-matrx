"use client";

import { useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Plus, Smile, X, Paperclip } from "lucide-react";
import type { ComposerInputRenderProps } from "@ai-matrx/messaging/react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@ai-matrx/design-system";
import { MarkdownErrorBoundary } from "@ai-matrx/rich-content/display/chat-markdown/internal-handlers/MarkdownErrorBoundary";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { ProTextarea } from "@/components/official/ProTextarea";
import type { SurfaceScopePayload } from "@ai-matrx/chat/surfaces/types";

// One user-triggered boundary for the picker family, never loaded for a closed menu.
const Tools = dynamic(() => import("./MessagesComposerTools"), {
  ssr: false,
  loading: () => <p className="p-4 text-sm">Opening picker…</p>,
});

export function MessagesComposerInput({
  input,
  surfaceName,
  getApplicationScope,
}: {
  input: ComposerInputRenderProps;
  surfaceName: string;
  getApplicationScope?: () => SurfaceScopePayload;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const selection = useRef({ start: 0, end: 0 });
  const [pickerError, setPickerError] = useState<Error | null>(null);
  const [menu, setMenu] = useState<"attach" | "emoji" | null>(null);
  function rememberSelection() {
    selection.current = {
      start: ref.current?.selectionStart ?? input.value.length,
      end: ref.current?.selectionEnd ?? input.value.length,
    };
  }
  function insertEmoji(emoji: string) {
    const { start, end } = selection.current;
    input.onChange(
      input.value.slice(0, start) + emoji + input.value.slice(end),
    );
    selection.current = {
      start: start + emoji.length,
      end: start + emoji.length,
    };
    setMenu(null);
    requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.setSelectionRange(
        start + emoji.length,
        start + emoji.length,
      );
    });
  }
  const picker = (kind: "attach" | "emoji") => (
    <Popover
      open={menu === kind}
      onOpenChange={(open) => setMenu(open ? kind : null)}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className="messages-round-button"
          disabled={input.disabled}
          aria-label={
            kind === "attach"
              ? "Add attachments and references"
              : "Emoji picker"
          }
          onPointerDown={rememberSelection}
          onKeyDown={rememberSelection}
        >
          {kind === "attach" ? <Plus size={19} /> : <Smile size={18} />}
        </button>
      </PopoverTrigger>
      <PopoverContent /* sizing: fixed — a fixed-measure panel on purpose; its rows truncate inside the box */
        side="top"
        align={kind === "attach" ? "start" : "end"}
        className="w-[min(380px,calc(100vw-24px))] max-h-[min(600px,var(--radix-popover-content-available-height))] overflow-auto p-0"
      >
        {menu === kind && (
          <MarkdownErrorBoundary
            onError={setPickerError}
            fallback={
              <div role="alert" className="p-4 text-sm">
                Couldn’t open the picker.{" "}
                <ErrorAlchemyMenu
                  error={pickerError ?? "Picker could not open"}
                />
                <button type="button" onClick={() => setMenu(null)}>
                  Close and try again
                </button>
              </div>
            }
          >
            <Tools
              mode={kind}
              input={input}
              onClose={() => setMenu(null)}
              onEmoji={insertEmoji}
            />
          </MarkdownErrorBoundary>
        )}
      </PopoverContent>
    </Popover>
  );
  return (
    <div className="messages-composer-content">
      {input.additions.length > 0 && (
        <div className="messages-draft-attachments" aria-label="Attachments">
          {input.additions.map((item) => (
            <span key={item.id}>
              <Paperclip size={13} />
              <span>{item.label}</span>
              <button
                type="button"
                aria-label={`Remove ${item.label}`}
                onClick={() => input.removeAddition(item.id)}
              >
                <X size={13} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="messages-composer-line">
        {picker("attach")}
        <ProTextarea
          ref={ref}
          value={input.value}
          onChange={(event) => input.onChange(event.target.value)}
          onKeyDown={input.onKeyDown}
          onSubmit={input.onSubmit}
          disabled={input.disabled}
          submitDisabled={!input.canSend}
          allowEmptySubmit={input.additions.length > 0}
          submitLabel="Send reply"
          placeholder="Message"
          aria-label="Reply to conversation"
          autoGrow
          minHeight={36}
          rows={1}
          maxHeight={220}
          enableTextStats={false}
          surfaceName={surfaceName}
          {...(getApplicationScope ? { getApplicationScope } : {})}
          wrapperClassName="messages-composer min-w-0 flex-1"
        />
        {picker("emoji")}
      </div>
    </div>
  );
}
