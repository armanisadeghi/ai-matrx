"use client";

import { useState, useEffect } from "react";
import { MatrxDynamicPanelHost } from "@/components/matrx/resizable/MatrxDynamicPanelHost";
import { Button } from "@/components/ui/button";
import { Mail, Send, Loader2, CheckCircle, XCircle, ChevronDown, ChevronUp } from "lucide-react";

interface Recipient {
  id: string;
  email: string;
  name: string;
}

interface EmailConfig {
  defaultFrom: string;
  allowedDomains: string[];
}

interface EmailComposeSheetProps {
  isOpen: boolean;
  onClose: () => void;
  recipients: Recipient[];
  defaultSubject?: string;
  defaultMessage?: string;
  title?: string;
  /** When true, sends as the authenticated user (their name in "from", their email as reply-to) */
  sendAsUser?: boolean;
}

export function EmailComposeSheet({
  isOpen,
  onClose,
  recipients,
  defaultSubject = "",
  defaultMessage = "",
  title = "Compose Email",
  sendAsUser = false,
}: EmailComposeSheetProps) {
  const [subject, setSubject] = useState(defaultSubject);
  const [message, setMessage] = useState(defaultMessage);
  const [customFrom, setCustomFrom] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [emailConfig, setEmailConfig] = useState<EmailConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; msg: string } | null>(null);

  useEffect(() => {
    fetch("/api/admin/email")
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.config) {
          setEmailConfig(data.config);
        }
      })
      .catch(console.error);
  }, []);

  const handleSend = async () => {
    if (!subject.trim() || !message.trim()) {
      setResult({ success: false, msg: "Subject and message are required" });
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const payload: Record<string, unknown> = {
        to: recipients.map((r) => r.email),
        subject,
        message,
        sendAsUser,
      };

      if (!sendAsUser && customFrom.trim()) {
        payload.from = customFrom.trim();
      }

      const res = await fetch("/api/admin/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      setResult({ success: data.success, msg: data.msg });

      if (data.success) {
        setTimeout(() => {
          setSubject(defaultSubject);
          setMessage(defaultMessage);
          setCustomFrom("");
          setShowAdvanced(false);
          setResult(null);
          onClose();
        }, 2000);
      }
    } catch {
      setResult({ success: false, msg: "Failed to send email" });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setSubject(defaultSubject);
    setMessage(defaultMessage);
    setCustomFrom("");
    setShowAdvanced(false);
    setResult(null);
    onClose();
  };

  return (
    <MatrxDynamicPanelHost
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) handleClose();
      }}
      dismissDisabled={loading}
      title={title}
      description="Compose and send email to selected recipients"
      position="right"
      defaultSize={42}
      contentClassName="overflow-y-auto"
    >
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1.5">
            To ({recipients.length} recipient{recipients.length !== 1 ? "s" : ""})
          </label>
          <div className="flex flex-wrap gap-2 p-2 bg-muted rounded-lg max-h-24 overflow-y-auto">
            {recipients.slice(0, 10).map((r) => (
              <span
                key={r.id}
                className="inline-flex items-center gap-1 px-2 py-1 bg-background border rounded-full text-xs"
              >
                <Mail className="w-3 h-3 text-muted-foreground" />
                {r.name || r.email}
              </span>
            ))}
            {recipients.length > 10 && (
              <span className="inline-flex items-center px-2 py-1 text-xs text-muted-foreground">
                +{recipients.length - 10} more
              </span>
            )}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">Subject</label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Enter email subject"
            className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">Message</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Enter your message..."
            rows={8}
            className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
          />
        </div>

        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          {showAdvanced ? (
            <ChevronUp className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
          {showAdvanced ? "Hide" : "Show"} advanced options
        </button>

        {showAdvanced && (
          <div>
            <label className="block text-sm font-medium mb-1.5">
              From (optional)
            </label>
            <input
              type="text"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              placeholder={emailConfig?.defaultFrom || "Display Name <email@domain.com>"}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <p className="text-xs text-muted-foreground mt-1">
              {emailConfig?.allowedDomains && emailConfig.allowedDomains.length > 0 ? (
                <>Allowed domains: {emailConfig.allowedDomains.join(", ")}</>
              ) : (
                <>Leave blank to use default: {emailConfig?.defaultFrom || "loading..."}</>
              )}
            </p>
          </div>
        )}

        {result && (
          <div
            className={`flex items-center gap-2 px-4 py-3 rounded-lg ${
              result.success
                ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300"
                : "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300"
            }`}
          >
            {result.success ? (
              <CheckCircle className="w-4 h-4" />
            ) : (
              <XCircle className="w-4 h-4" />
            )}
            <span className="text-sm">{result.msg}</span>
          </div>
        )}

        <div className="flex gap-2 pt-4">
          <Button variant="outline" onClick={handleClose} className="flex-1">
            Cancel
          </Button>
          <Button
            onClick={handleSend}
            disabled={loading || !subject.trim() || !message.trim()}
            className="flex-1"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                Send Email
              </>
            )}
          </Button>
        </div>
      </div>
    </MatrxDynamicPanelHost>
  );
}
