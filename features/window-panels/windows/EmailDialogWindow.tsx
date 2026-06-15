"use client";

import React, { useState } from "react";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const isValidEmail = (email: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

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
  };

  const handleClose = () => {
    if (!loading) {
      setEmail("");
      setError(null);
      onClose();
    }
  };

  return (
    <WindowPanel
      title={title}
      width={400}
      height={280}
      urlSyncKey="email_dialog"
      onClose={handleClose}
      overlayId="emailDialogWindow"
      onCollectData={() => ({
        to: email || null,
        subject: null,
        draftBody: null,
      })}
    >
      <form
        onSubmit={handleSubmit}
        className="flex flex-col h-full bg-background"
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
              onChange={(e) => {
                setEmail(e.target.value);
                setError(null);
              }}
              disabled={loading}
              autoFocus
              className="text-base"
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        </div>

        <div className="px-6 py-4 mt-auto flex justify-end gap-2 bg-muted/20 border-t border-border">
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={loading || !email.trim()}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Mail className="mr-2 h-4 w-4" />
                {submitLabel}
              </>
            )}
          </Button>
        </div>
      </form>
    </WindowPanel>
  );
}
