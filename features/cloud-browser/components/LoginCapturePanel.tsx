"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/lib/toast";
import {
  fillSavedLogin,
  getSavedLoginChoices,
  saveAndFillHumanLogin,
  type SavedLoginChoice,
} from "../service";

interface LoginCapturePanelProps {
  runId: string;
  profileId: string;
  pageUrl: string;
}

export function LoginCapturePanel({
  runId,
  profileId,
  pageUrl,
}: LoginCapturePanelProps) {
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
  const [savedChoices, setSavedChoices] = useState<SavedLoginChoice[]>([]);

  useEffect(() => {
    let active = true;
    void getSavedLoginChoices(pageUrl)
      .then((choices) => {
        if (active) setSavedChoices(choices);
      })
      .catch(() => {
        if (active) setSavedChoices([]);
      });
    return () => {
      active = false;
    };
  }, [pageUrl]);

  async function fillFromSaved(choice: SavedLoginChoice) {
    setSaving(true);
    try {
      await fillSavedLogin({ runId, pageUrl, itemId: choice.itemId });
      toast.success("Saved sign-in entered in the private browser.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not use saved sign-in.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function submit() {
    setSaving(true);
    try {
      await saveAndFillHumanLogin({
        runId,
        profileId,
        pageUrl,
        displayName,
        username,
        password,
      });
      setPassword("");
      toast.success("Saved and entered in the private browser.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not complete sign-in.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-3">
      <div>
        <p className="text-sm font-medium">Sign in privately</p>
        <p className="text-xs text-muted-foreground">
          What you type here goes straight to your vault and this browser. The
          agent never receives it.
        </p>
      </div>
      {savedChoices.length > 0 ? (
        <div className="space-y-2">
          {savedChoices.map((choice) => (
            <Button
              key={choice.itemId}
              size="sm"
              variant="secondary"
              disabled={saving}
              onClick={() => void fillFromSaved(choice)}
            >
              Use {choice.displayName}
            </Button>
          ))}
          <p className="text-xs text-muted-foreground">
            Or save a different sign-in:
          </p>
        </div>
      ) : null}
      <div className="grid gap-2">
        <Label htmlFor="cloud-browser-login-name">Name this sign-in</Label>
        <Input
          id="cloud-browser-login-name"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
        />
        <Label htmlFor="cloud-browser-login-username">Username or email</Label>
        <Input
          id="cloud-browser-login-username"
          autoComplete="username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
        />
        <Label htmlFor="cloud-browser-login-password">Password</Label>
        <Input
          id="cloud-browser-login-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </div>
      <Button
        size="sm"
        disabled={saving || !displayName || !username || !password}
        onClick={() => void submit()}
      >
        {saving ? "Signing in…" : "Save and sign in"}
      </Button>
    </div>
  );
}
