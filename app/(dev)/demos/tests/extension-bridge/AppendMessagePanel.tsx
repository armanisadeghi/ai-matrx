"use client";

import { useState } from "react";
import { MessageSquarePlus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { APPEND_MESSAGE_ENDPOINT, DEFAULT_APPEND_BODY } from "./constants";
import { JsonViewer } from "./JsonViewer";

type Role = "user" | "assistant" | "system";

export interface AppendMessagePanelProps {
  useBearerAuth: boolean;
  /** Notify parent for the live event log. */
  onCompleted: (entry: {
    ts: number;
    status: number;
    ok: boolean;
    role: Role;
    conversationId: string;
    response: unknown;
    error?: string;
  }) => void;
}

export function AppendMessagePanel({
  useBearerAuth,
  onCompleted,
}: AppendMessagePanelProps) {
  const [conversationId, setConversationId] = useState("");
  const [role, setRole] = useState<Role>("user");
  const [content, setContent] = useState("hello from the bridge demo");
  const [metadataJson, setMetadataJson] = useState<string>(
    JSON.stringify({ source: "extension-bridge-demo" }, null, 2),
  );
  const [bearerToken, setBearerToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [response, setResponse] = useState<{
    status: number;
    body: unknown;
  } | null>(null);

  const handleSend = async () => {
    if (!conversationId.trim()) {
      toast.error("conversationId is required");
      return;
    }

    let metadata: Record<string, unknown> | undefined;
    if (metadataJson.trim()) {
      try {
        metadata = JSON.parse(metadataJson);
      } catch (err) {
        toast.error(
          `Metadata is not valid JSON: ${err instanceof Error ? err.message : "parse error"}`,
        );
        return;
      }
    }

    if (useBearerAuth && !bearerToken.trim()) {
      toast.error(
        "Bearer mode is on but no token provided. Paste AGENT_API_KEY into the token field.",
      );
      return;
    }

    setBusy(true);
    setResponse(null);
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (useBearerAuth) {
        headers["Authorization"] = `Bearer ${bearerToken.trim()}`;
      }
      const res = await fetch(APPEND_MESSAGE_ENDPOINT, {
        method: "POST",
        headers,
        // include credentials so cookie auth works when bearer is off
        credentials: useBearerAuth ? "omit" : "include",
        body: JSON.stringify({
          conversationId: conversationId.trim(),
          role,
          content,
          ...(metadata ? { metadata } : {}),
        }),
      });
      let body: unknown;
      try {
        body = await res.json();
      } catch {
        body = await res.text();
      }
      setResponse({ status: res.status, body });
      onCompleted({
        ts: Date.now(),
        status: res.status,
        ok: res.ok,
        role,
        conversationId: conversationId.trim(),
        response: body,
      });
      if (res.ok) {
        toast.success(`Appended message (status ${res.status})`);
      } else {
        toast.error(`Append failed (status ${res.status})`);
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      setResponse({ status: 0, body: { error } });
      onCompleted({
        ts: Date.now(),
        status: 0,
        ok: false,
        role,
        conversationId: conversationId.trim(),
        response: null,
        error,
      });
      toast.error(`Network error: ${error}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageSquarePlus className="h-4 w-4 text-muted-foreground" />
          Append message
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="append-cid" className="text-xs">
            Conversation ID
          </Label>
          <Input
            id="append-cid"
            placeholder="00000000-0000-0000-0000-000000000000"
            value={conversationId}
            onChange={(e) => setConversationId(e.target.value)}
            className="h-9 font-mono text-xs"
          />
          <p className="text-[11px] text-muted-foreground">
            Paste any cx_conversation UUID from the database. The route returns
            404 for unknown IDs.
          </p>
        </div>

        <div className="space-y-2">
          <Label className="text-xs">Role</Label>
          <RadioGroup
            value={role}
            onValueChange={(v) => setRole(v as Role)}
            className="flex gap-4"
          >
            {(["user", "assistant", "system"] as const).map((r) => (
              <div key={r} className="flex items-center gap-2">
                <RadioGroupItem value={r} id={`role-${r}`} />
                <Label htmlFor={`role-${r}`} className="cursor-pointer text-xs">
                  {r}
                </Label>
              </div>
            ))}
          </RadioGroup>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="append-content" className="text-xs">
            Content
          </Label>
          <Textarea
            id="append-content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={3}
            className="text-sm"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="append-metadata" className="text-xs">
            Metadata (JSON, optional)
          </Label>
          <Textarea
            id="append-metadata"
            value={metadataJson}
            onChange={(e) => setMetadataJson(e.target.value)}
            rows={3}
            spellCheck={false}
            className="font-mono text-xs"
          />
        </div>

        {useBearerAuth && (
          <div className="space-y-1.5 rounded-md border border-warning/30 bg-warning/5 p-2">
            <Label htmlFor="bearer-token" className="text-xs">
              Bearer token (AGENT_API_KEY)
            </Label>
            <Input
              id="bearer-token"
              type="password"
              placeholder="mk_agent_…"
              value={bearerToken}
              onChange={(e) => setBearerToken(e.target.value)}
              className="h-9 font-mono text-xs"
              autoComplete="off"
            />
            <p className="text-[11px] text-muted-foreground">
              Paste the value of AGENT_API_KEY from .env.local. Only stored in
              this component's state — not persisted.
            </p>
          </div>
        )}

        <Button
          type="button"
          onClick={handleSend}
          disabled={busy}
          className="w-full sm:w-auto"
        >
          {busy ? "Sending…" : "POST append-message"}
        </Button>

        {response && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label className="text-xs">Response</Label>
              <Badge
                variant={
                  response.status >= 200 && response.status < 300
                    ? "success"
                    : response.status === 0
                      ? "destructive"
                      : "warning"
                }
              >
                {response.status === 0 ? "network error" : response.status}
              </Badge>
            </div>
            <JsonViewer value={response.body} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
