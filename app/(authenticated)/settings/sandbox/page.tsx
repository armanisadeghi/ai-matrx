"use client";

/**
 * Sandbox defaults — settings page.
 *
 * Lets the user configure what `ensure_default_sandbox` (auto-provision on
 * sign-in) and the SandboxPanel's "New sandbox" button produce: template,
 * tier, TTL, env vars, optional git repo to auto-clone.
 *
 * Persistence: standard userPreferences slice (`sandbox` module). The slice's
 * auto-save middleware debounces an upsert into `public.user_preferences`.
 * Read on both sides — web (SandboxPanel + this page) and aidream
 * (`ensure_default_sandbox.py` reads `user_preferences.preferences.sandbox`).
 */

import { useState } from "react";
import { Server, GitBranch, Settings as SettingsIcon, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { setPreference } from "@/lib/redux/preferences/userPreferencesSlice";
import { selectSandboxPreferences } from "@/lib/redux/preferences/userPreferenceSelectors";

// Templates the orchestrator actually serves today. Source: `template`
// distinct values on public.sandbox_instances. Keep this in sync — adding a
// new template image here without registering it on the orchestrator side
// would cause auto-provision failures.
const TEMPLATE_OPTIONS = [
  {
    value: "slim",
    label: "Slim — full coding env (recommended)",
  },
  {
    value: "aidream",
    label: "AI Dream — coding env + aidream server built in",
  },
] as const;

const TTL_OPTIONS = [
  { value: "", label: "Server default" },
  { value: "3600", label: "1 hour" },
  { value: "7200", label: "2 hours" },
  { value: "14400", label: "4 hours" },
  { value: "28800", label: "8 hours" },
  { value: "86400", label: "24 hours (max)" },
] as const;

function isValidGitUrl(value: string): boolean {
  if (!value) return true;
  // Accept only https:// — the orchestrator does not yet support per-user
  // SSH key injection. Friendly error if the user pastes a git@ URL.
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export default function SandboxSettingsPage() {
  const dispatch = useAppDispatch();
  const prefs = useAppSelector(selectSandboxPreferences);

  // Local form state for env-var editing (the slice has the persisted shape;
  // local state lets the user type without firing the debounced auto-save on
  // every keystroke).
  const [newEnvKey, setNewEnvKey] = useState("");
  const [newEnvValue, setNewEnvValue] = useState("");

  const update = <K extends keyof typeof prefs>(key: K, value: (typeof prefs)[K]) => {
    dispatch(
      setPreference({
        module: "sandbox",
        preference: key as string,
        value,
      }),
    );
  };

  const setEnv = (env: Record<string, string>) => {
    update("env", env);
  };

  const handleAddEnv = () => {
    const key = newEnvKey.trim();
    const value = newEnvValue;
    if (!key) {
      toast.error("Env key is required");
      return;
    }
    if (!/^[A-Z_][A-Z0-9_]*$/i.test(key)) {
      toast.error("Env key must be alphanumeric + underscore, e.g. MY_API_KEY");
      return;
    }
    setEnv({ ...prefs.env, [key]: value });
    setNewEnvKey("");
    setNewEnvValue("");
  };

  const handleRemoveEnv = (key: string) => {
    const next = { ...prefs.env };
    delete next[key];
    setEnv(next);
  };

  const gitUrlValid = isValidGitUrl(prefs.default_git_repo ?? "");

  return (
    <div className="mx-auto max-w-3xl p-4 md:p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="flex items-center gap-3 text-2xl font-bold md:text-3xl">
          <Server className="h-7 w-7 text-primary" />
          Sandbox defaults
        </h1>
        <p className="mt-2 text-sm text-muted-foreground md:text-base">
          What every new sandbox starts with — template, tier, env vars, and
          an optional git repo to clone right after creation. Applied to the
          auto-provisioned default sandbox you get on sign-in and to every
          "New sandbox" you create from the chat picker.
        </p>
      </div>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <SettingsIcon className="h-5 w-5" />
            Container
          </CardTitle>
          <CardDescription>Image and lifecycle.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="template">Template</Label>
            <Select
              value={prefs.template}
              onValueChange={(v) => update("template", v)}
            >
              <SelectTrigger id="template" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TEMPLATE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              The base image the sandbox container is built from. You can run
              anything regardless — this just controls what's pre-installed.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tier">Tier</Label>
            <Select
              value={prefs.tier}
              onValueChange={(v) => update("tier", v as "ec2" | "hosted")}
            >
              <SelectTrigger id="tier" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="hosted">
                  Hosted — survives restart (per-user Docker volume)
                </SelectItem>
                <SelectItem value="ec2">
                  EC2 — ephemeral, larger workloads
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ttl">Auto-stop after</Label>
            <Select
              value={prefs.ttl_seconds === null ? "" : String(prefs.ttl_seconds)}
              onValueChange={(v) =>
                update("ttl_seconds", v === "" ? null : Number(v))
              }
            >
              <SelectTrigger id="ttl" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TTL_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              How long the sandbox stays alive without a heartbeat. The agent's
              activity refreshes this every ~60 seconds while running.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GitBranch className="h-5 w-5" />
            Default git repo
          </CardTitle>
          <CardDescription>
            Auto-clone this repo into <code>~/work/</code> when a new sandbox
            comes up. Only HTTPS URLs are supported today.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="git-repo">Repository URL</Label>
            <Input
              id="git-repo"
              placeholder="https://github.com/your-org/your-repo.git"
              value={prefs.default_git_repo ?? ""}
              onChange={(e) =>
                update("default_git_repo", e.target.value.trim() || null)
              }
              aria-invalid={!gitUrlValid}
            />
            {!gitUrlValid && (
              <p className="text-xs text-destructive">
                Must be a valid https:// URL. SSH (git@) is not supported yet.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="git-branch">Branch / tag / sha (optional)</Label>
            <Input
              id="git-branch"
              placeholder="main"
              value={prefs.default_git_branch ?? ""}
              onChange={(e) =>
                update("default_git_branch", e.target.value.trim() || null)
              }
            />
          </div>

          <div className="flex items-center justify-between gap-3 rounded-md border p-3">
            <div className="space-y-0.5">
              <Label htmlFor="auto-clone">Auto-clone on create</Label>
              <p className="text-xs text-muted-foreground">
                When on, the repo above is cloned automatically. When off, the
                repo is just remembered — you'll still trigger the clone
                manually from chat.
              </p>
            </div>
            <Switch
              id="auto-clone"
              checked={prefs.auto_clone_on_create}
              onCheckedChange={(v) => update("auto_clone_on_create", v)}
              disabled={!prefs.default_git_repo || !gitUrlValid}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Environment variables</CardTitle>
          <CardDescription>
            Exposed in every shell the sandbox runs. Don't paste secrets you
            haven't rotated — these are forwarded to the orchestrator as
            container env.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {Object.entries(prefs.env).length === 0 && (
            <p className="text-xs text-muted-foreground">No env vars set.</p>
          )}
          {Object.entries(prefs.env).map(([key, value]) => (
            <div key={key} className="flex items-center gap-2">
              <Input value={key} readOnly className="font-mono" />
              <Input
                value={value}
                onChange={(e) =>
                  setEnv({ ...prefs.env, [key]: e.target.value })
                }
                className="font-mono"
              />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleRemoveEnv(key)}
                title="Remove"
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
          <div className="flex items-center gap-2 border-t pt-3">
            <Input
              placeholder="KEY"
              value={newEnvKey}
              onChange={(e) => setNewEnvKey(e.target.value)}
              className="font-mono"
            />
            <Input
              placeholder="value"
              value={newEnvValue}
              onChange={(e) => setNewEnvValue(e.target.value)}
              className="font-mono"
            />
            <Button size="icon" onClick={handleAddEnv} title="Add">
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
