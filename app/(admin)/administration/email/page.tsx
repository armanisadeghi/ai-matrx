"use client";

import { useState, useEffect } from "react";
import {
  Mail,
  Send,
  Users,
  FileText,
  Loader2,
  CheckCircle,
  XCircle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  message: string;
}

interface EmailConfig {
  defaultFrom: string;
  allowedDomains: string[];
}

interface UserOption {
  id: string;
  email: string;
  display_name: string | null;
}

type RecipientMode = "custom" | "selected";

export default function AdminEmailPage() {
  const [recipientMode, setRecipientMode] = useState<RecipientMode>("custom");
  const [customEmails, setCustomEmails] = useState("");
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [customFrom, setCustomFrom] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [emailConfig, setEmailConfig] = useState<EmailConfig | null>(null);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    msg: string;
  } | null>(null);

  // Fetch templates and config on mount
  useEffect(() => {
    fetch("/api/admin/email")
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          if (data.data) setTemplates(data.data);
          if (data.config) setEmailConfig(data.config);
        }
      })
      .catch(console.error);
  }, []);

  // Fetch users when "selected" mode is chosen
  useEffect(() => {
    if (recipientMode === "selected" && users.length === 0) {
      setLoadingUsers(true);
      fetch("/api/users?limit=100")
        .then((res) => res.json())
        .then((data) => {
          if (data.success && data.data) {
            setUsers(data.data);
          }
        })
        .catch(console.error)
        .finally(() => setLoadingUsers(false));
    }
  }, [recipientMode, users.length]);

  const handleTemplateSelect = (templateId: string) => {
    const template = templates.find((t) => t.id === templateId);
    if (template) {
      setSubject(template.subject);
      setMessage(template.message);
    }
  };

  const handleSend = async () => {
    if (!subject.trim() || !message.trim()) {
      setResult({ success: false, msg: "Subject and message are required" });
      return;
    }

    let payload: {
      subject: string;
      message: string;
      to?: string[];
      userIds?: string[];
      from?: string;
    } = {
      subject,
      message,
    };

    // Include custom from if provided
    if (customFrom.trim()) {
      payload.from = customFrom.trim();
    }

    if (recipientMode === "custom") {
      const emails = customEmails
        .split(/[,\n]/)
        .map((e) => e.trim())
        .filter((e) => e.includes("@"));

      if (emails.length === 0) {
        setResult({
          success: false,
          msg: "Please enter at least one valid email address",
        });
        return;
      }
      payload.to = emails;
    } else if (recipientMode === "selected") {
      if (selectedUserIds.length === 0) {
        setResult({ success: false, msg: "Please select at least one user" });
        return;
      }
      payload.userIds = selectedUserIds;
    }

    setLoading(true);
    setResult(null);

    try {
      const res = await fetch("/api/admin/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      setResult({ success: data.success, msg: data.msg });

      if (data.success) {
        // Clear form on success
        setCustomEmails("");
        setSelectedUserIds([]);
        setSubject("");
        setMessage("");
        setCustomFrom("");
        setShowAdvanced(false);
      }
    } catch (error) {
      setResult({ success: false, msg: "Failed to send email" });
    } finally {
      setLoading(false);
    }
  };

  const toggleUserSelection = (userId: string) => {
    setSelectedUserIds((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId],
    );
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Email Users</h1>
        <p className="text-muted-foreground">
          Send emails to users directly from the admin portal
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Email Form */}
        <div className="lg:col-span-2 space-y-6">
          {/* Recipients Card */}
          <div className="bg-card rounded-lg border shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <Users className="w-4 h-4 text-primary" />
              </div>
              <div>
                <h2 className="font-semibold">Recipients</h2>
                <p className="text-xs text-muted-foreground">
                  Choose who receives this email
                </p>
              </div>
            </div>
            <div className="p-6 space-y-4">
              {/* Recipient Mode Tabs */}
              <div className="flex gap-2">
                {[
                  { mode: "custom" as const, label: "Custom Emails" },
                  { mode: "selected" as const, label: "Selected Users" },
                ].map(({ mode, label }) => (
                  <Button
                    key={mode}
                    onClick={() => setRecipientMode(mode)}
                    variant={recipientMode === mode ? "default" : "outline"}
                    size="sm"
                  >
                    {label}
                  </Button>
                ))}
              </div>

              {/* Custom Emails Input */}
              {recipientMode === "custom" && (
                <div>
                  <label className="block text-sm font-medium mb-1.5">
                    Email Addresses
                  </label>
                  <textarea
                    value={customEmails}
                    onChange={(e) => setCustomEmails(e.target.value)}
                    placeholder="Enter email addresses (one per line or comma-separated)"
                    rows={3}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Separate multiple emails with commas or new lines
                  </p>
                </div>
              )}

              {/* User Selection */}
              {recipientMode === "selected" && (
                <div>
                  <label className="block text-sm font-medium mb-1.5">
                    Select Users ({selectedUserIds.length} selected)
                  </label>
                  {loadingUsers ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Loading users...
                    </div>
                  ) : (
                    <div className="border rounded-lg max-h-48 overflow-y-auto">
                      {users.map((user) => (
                        <label
                          key={user.id}
                          className="flex items-center gap-3 px-3 py-2 hover:bg-muted cursor-pointer border-b last:border-b-0"
                        >
                          <Checkbox
                            checked={selectedUserIds.includes(user.id)}
                            onCheckedChange={() => toggleUserSelection(user.id)}
                            className="shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">
                              {user.display_name || "No name"}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {user.email}
                            </p>
                          </div>
                        </label>
                      ))}
                      {users.length === 0 && (
                        <p className="text-sm text-muted-foreground py-4 text-center">
                          No users found
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Email Content Card */}
          <div className="bg-card rounded-lg border shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <Mail className="w-4 h-4 text-primary" />
              </div>
              <div>
                <h2 className="font-semibold">Email Content</h2>
                <p className="text-xs text-muted-foreground">
                  Compose your email message
                </p>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5">
                  Subject
                </label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Enter email subject"
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">
                  Message
                </label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Enter your message..."
                  rows={10}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none font-mono"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Plain text message. Line breaks will be preserved.
                </p>
              </div>

              {/* Advanced Options */}
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
                    From Address (optional)
                  </label>
                  <input
                    type="text"
                    value={customFrom}
                    onChange={(e) => setCustomFrom(e.target.value)}
                    placeholder={
                      emailConfig?.defaultFrom ||
                      "Display Name <email@domain.com>"
                    }
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    {emailConfig?.allowedDomains &&
                    emailConfig.allowedDomains.length > 0 ? (
                      <>
                        Allowed domains: {emailConfig.allowedDomains.join(", ")}
                      </>
                    ) : (
                      <>
                        Leave blank to use default:{" "}
                        {emailConfig?.defaultFrom || "loading..."}
                      </>
                    )}
                  </p>
                </div>
              )}

              {/* Result Message */}
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

              {/* Send Button */}
              <Button
                onClick={handleSend}
                disabled={loading || !subject.trim() || !message.trim()}
                className="w-full"
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
        </div>

        {/* Templates Sidebar */}
        <div className="space-y-6">
          <div className="bg-card rounded-lg border shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <FileText className="w-4 h-4 text-primary" />
              </div>
              <div>
                <h2 className="font-semibold">Templates</h2>
                <p className="text-xs text-muted-foreground">
                  Quick-start templates
                </p>
              </div>
            </div>
            <div className="p-4 space-y-2">
              {templates.map((template) => (
                <button
                  key={template.id}
                  onClick={() => handleTemplateSelect(template.id)}
                  className="w-full text-left px-4 py-3 rounded-lg border hover:border-primary hover:bg-primary/5 transition-colors"
                >
                  <p className="text-sm font-medium">{template.name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {template.subject}
                  </p>
                </button>
              ))}
              {templates.length === 0 && (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  Loading templates...
                </p>
              )}
            </div>
          </div>

          {/* Tips Card */}
          <div className="bg-primary/5 rounded-lg border border-primary/20 p-6">
            <h3 className="font-semibold mb-3">Tips</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">•</span>
                Keep subject lines clear and concise
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">•</span>
                Personalize when possible
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">•</span>
                Test with your own email first
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">•</span>
                Avoid spam trigger words
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
