"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/lib/toast";
import { saveAndFillHumanLogin } from "../service";

interface LoginCapturePanelProps {
  runId: string;
  pageUrl: string;
}

export function LoginCapturePanel({ runId, pageUrl }: LoginCapturePanelProps) {
  const [displayName, setDisplayName] = useState(() => {
    try {
      return new URL(pageUrl).hostname;
    } catch {
      return "Website sign-in";
    }
  });
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    try {
      await saveAndFillHumanLogin({ runId, pageUrl, displayName, username, password });
      setPassword("");
      toast.success("Saved and entered in the private browser.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not complete sign-in.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-3">
      <div>
        <p className="text-sm font-medium">Sign in privately</p>
        <p className="text-xs text-muted-foreground">
          What you type here goes straight to your vault and this browser. The agent never receives it.
        </p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="cloud-browser-login-name">Name this sign-in</Label>
        <Input id="cloud-browser-login-name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
        <Label htmlFor="cloud-browser-login-username">Username or email</Label>
        <Input id="cloud-browser-login-username" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} />
        <Label htmlFor="cloud-browser-login-password">Password</Label>
        <Input id="cloud-browser-login-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />
      </div>
      <Button size="sm" disabled={saving || !displayName || !username || !password} onClick={() => void submit()}>
        {saving ? "Signing in…" : "Save and sign in"}
      </Button>
    </div>
  );
}
