"use client";

// EmailDialogWindow — small "email this to yourself" prompt.
//
// Thin COMPOSITION ROOT (mirrors FeedbackWindow / NotesWindow): a
// `useEmailDialogForm` hook hoists the form state at the window root, the root
// maps `footerLeft`/`footerRight` onto WindowPanel's slots, and the body holds
// ONLY content. The Cancel/Send bar is a footer slot — NOT hand-rolled chrome
// inside the body — so it can't duplicate WindowPanel's footer.

import React, { useCallback, useState } from "react";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Loader2, Mail } from "lucide-react";

interface EmailDialogWindowProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  submitLabel?: string;
}

export default function EmailDialogWindow({
  isOpen,
  onClose,
  title = "Email to yourself",
  description = "Enter your email address to receive the content.",
  submitLabel = "Send Email",
}: EmailDialogWindowProps) {
  const form = useEmailDialogForm({ onClose });

  if (!isOpen) return null;

  return (
    <WindowPanel
      title={title}
      width={400}
      height={280}
      urlSyncKey="email_dialog"
      onClose={form.handleClose}
      overlayId="emailDialogWindow"
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
      onCollectData={() => ({
        to: form.email || null,
        subject: null,
        draftBody: null,
      })}
      footerLeft={<EmailDialogFooterLeft form={form} />}
      footerRight={<EmailDialogFooterRight form={form} submitLabel={submitLabel} />}
    >
      <EmailDialogBody form={form} description={description} />
    </WindowPanel>
  );
}

// ─── useEmailDialogForm — hoisted shared state ────────────────────────────────
// Owns ALL email-dialog form state + handlers so the WindowPanel root can feed
// both the body content and the footer slots. Mirrors `useFeedbackForm`.

type EmailDialogFormState = ReturnType<typeof useEmailDialogForm>;

function useEmailDialogForm({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isValidEmail = useCallback(
    (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
    [],
  );

  const handleSubmit = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault();

      if (!email.trim()) {
        setError("Email is required");
        return;
      }

      if (!isValidEmail(email)) {
        setError("Please enter a valid email address");
        return;
      }

      setEmail("");
      onClose();
    },
    [email, isValidEmail, onClose],
  );

  const handleClose = useCallback(() => {
    if (!loading) {
      setEmail("");
      setError(null);
      onClose();
    }
  }, [loading, onClose]);

  const handleEmailChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setEmail(e.target.value);
      setError(null);
    },
    [],
  );

  return {
    email,
    loading,
    setLoading,
    error,
    handleSubmit,
    handleClose,
    handleEmailChange,
  };
}

// ─── Footer slots ─────────────────────────────────────────────────────────────

function EmailDialogFooterLeft({ form }: { form: EmailDialogFormState }) {
  if (!form.error) return null;
  return (
    <span className="text-destructive leading-snug">{form.error}</span>
  );
}

function EmailDialogFooterRight({
  form,
  submitLabel,
}: {
  form: EmailDialogFormState;
  submitLabel: string;
}) {
  const { email, loading, handleClose, handleSubmit } = form;
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        className="px-2 text-xs font-medium rounded-md border border-border text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-50"
        onClick={handleClose}
        disabled={loading}
      >
        Cancel
      </button>
      <button
        type="button"
        className={cn(
          "flex items-center gap-1.5 px-2.5 text-xs font-medium rounded-md transition-colors",
          "[&_svg]:w-3.5 [&_svg]:h-3.5",
          email.trim() && !loading
            ? "bg-primary text-primary-foreground hover:bg-primary/90"
            : "bg-muted text-muted-foreground cursor-not-allowed",
        )}
        onClick={() => handleSubmit()}
        disabled={loading || !email.trim()}
      >
        {loading ? <Loader2 className="animate-spin" /> : <Mail />}
        {loading ? "Sending..." : submitLabel}
      </button>
    </div>
  );
}

// ─── EmailDialogBody — content only ───────────────────────────────────────────
// Renders ONLY the form fields. The Cancel/Send bar and the error line live in
// the WindowPanel footer slots, not here.

function EmailDialogBody({
  form,
  description,
}: {
  form: EmailDialogFormState;
  description: string;
}) {
  const { email, loading, handleSubmit, handleEmailChange } = form;
  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col flex-1 min-h-0 overflow-auto"
    >
      <div className="px-6 pt-6 pb-2">
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>

      <div className="px-6 py-4 flex-1">
        <div className="space-y-2">
          <Label htmlFor="email">Email address</Label>
          <Input
            id="email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={handleEmailChange}
            disabled={loading}
            autoFocus
            className="text-base"
          />
        </div>
      </div>
      {/* Hidden submit keeps Enter-to-submit working from the input. */}
      <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
    </form>
  );
}
