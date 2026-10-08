"use client";

/**
 * /user-settings, rebuilt by hand on the settled 28px system: the REAL settings
 * tree (features/settings/registry), the REAL Email preferences (the same
 * `/api/user/email-preferences` read the Email tab makes) and the REAL text
 * generation defaults (`useSetting` reads). Read-only: toggles and selects
 * change this page only; Save says it saved nothing. No `useSetting` writer is
 * ever called.
 *
 * iOS-settings structure: a group title, then one bordered group of hairline
 * rows — label (13px), one line (12px), control on the right. Space goes
 * between groups, never padding inside padding.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Mail, Settings, Type } from "lucide-react";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { getTabTree } from "@/features/settings/registry";
import { SETTINGS_BASE, tabIdToHref } from "@/features/settings/route-shell/routing";
import { useSetting } from "@/features/settings/hooks/useSetting";
import { settingDoorHref } from "@/features/settings/doors/settingDoorTarget";
import { CHAT_DEFAULT_MODEL_KNOB } from "@/features/ai-models/preferredChatModel";
import { CREATIVITY_LEVEL_OPTIONS, LANGUAGE_OPTIONS, TEXT_TONE_OPTIONS } from "@/features/settings/agent-writable-settings";
import { fetchWithOrganization } from "@/lib/organizations/fetchWithOrganization";
import { toast } from "@/lib/toast";
import { ReadFailure } from "@/components/read-state/ReadFailure";
import { cn } from "@/lib/utils";
import { SampleTitle } from "../../_components/kit";
import { Button, ControlRow, ControlScope, RegionSkeleton, RowGroup, Select, SettingRow, Switch } from "@ai-matrx/design-system/controls";

type SampleTab = "communication.email" | "ai.textGeneration";
const SAMPLE_TABS: { value: SampleTab; label: string }[] = [
  { value: "communication.email", label: "Email" },
  { value: "ai.textGeneration", label: "Text generation" },
];

const NOT_SAVED = "Sample page — nothing was changed.";

export function UserSettingsSample() {
  const [tab, setTab] = useState<SampleTab>("communication.email");
  // Non-admin tree: the same tabs a person sees.
  const tree = getTabTree(false);

  return (
    <>
      <PageHeader>
        <SampleTitle icon={Settings} title="Settings" meta="Sample" />
      </PageHeader>
      <ControlScope className="h-full">
        <div className="flex h-full overflow-hidden bg-textured">
          {/* Settings tree — 28px rows, 13px labels, 16px glyphs. */}
          <nav aria-label="Settings" className="hidden w-56 shrink-0 overflow-y-auto border-r border-border py-2 lg:block">
            {tree.map((group) => (
              <div key={group.id} className="mb-3">
                <div className="px-3 pb-1 text-[0.6875rem] font-medium uppercase tracking-wide text-muted-foreground">
                  {group.label}
                </div>
                {(group.children ?? [group]).map((t) => {
                  const Icon = t.icon;
                  const local = SAMPLE_TABS.some((s) => s.value === t.id);
                  const active = t.id === tab;
                  const cls = cn(
                    "mx-1.5 flex h-7 items-center gap-2 rounded-md px-1.5 text-[0.8125rem]",
                    active ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                  );
                  return local ? (
                    <button key={t.id} type="button" className={cn(cls, "w-[calc(100%-0.75rem)] text-left")} onClick={() => setTab(t.id as SampleTab)}>
                      <Icon className="size-4 shrink-0" aria-hidden />
                      <span className="truncate">{t.label}</span>
                    </button>
                  ) : (
                    <Link key={t.id} href={tabIdToHref(SETTINGS_BASE, t.id)} className={cls}>
                      <Icon className="size-4 shrink-0" aria-hidden />
                      <span className="truncate">{t.label}</span>
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>

          <div className="min-w-0 flex-1 overflow-y-auto">
            <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-3 py-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  {tab === "communication.email" ? <Mail className="size-4 text-muted-foreground" aria-hidden /> : <Type className="size-4 text-muted-foreground" aria-hidden />}
                  <h1 className="truncate text-[0.8125rem] font-semibold">{SAMPLE_TABS.find((s) => s.value === tab)?.label}</h1>
                </div>
                <div className="lg:hidden">
                  <ControlRow className="-mr-[3px]">
                    <Select value={tab} options={SAMPLE_TABS} onValueChange={setTab} aria-label="Settings page" style={{ width: "9.5rem" }} align="end" />
                  </ControlRow>
                </div>
              </div>
              {tab === "communication.email" ? <EmailSample /> : <TextGenerationSample />}
            </div>
          </div>
        </div>
      </ControlScope>
    </>
  );
}

/* ------------------------------ Email ------------------------------ */

interface EmailPreferences {
  sharing_notifications: boolean;
  organization_invitations: boolean;
  resource_updates: boolean;
  marketing_emails: boolean;
  weekly_digest: boolean;
  task_notifications: boolean;
  comment_notifications: boolean;
  message_notifications: boolean;
  message_digest: boolean;
}

const EMAIL_GROUPS: { title: string; rows: { key: keyof EmailPreferences; label: string; line: string }[] }[] = [
  {
    title: "Collaboration",
    rows: [
      { key: "sharing_notifications", label: "Sharing notifications", line: "When someone shares a document, agent, or task with you" },
      { key: "organization_invitations", label: "Organization invitations", line: "When someone invites you to an organization" },
      { key: "task_notifications", label: "Task notifications", line: "Assignments, status changes, due-date reminders" },
      { key: "comment_notifications", label: "Comment notifications", line: "When someone comments on your tasks, canvases, or notes" },
    ],
  },
  {
    title: "Communication",
    rows: [
      { key: "message_notifications", label: "Message notifications", line: "New direct messages and mentions" },
      { key: "resource_updates", label: "Resource updates", line: "Changes to resources you follow" },
    ],
  },
  {
    title: "Digests",
    rows: [
      { key: "weekly_digest", label: "Weekly digest", line: "A summary of the past week delivered Monday morning" },
      { key: "message_digest", label: "Message digest", line: "Unread messages bundled instead of sent individually" },
    ],
  },
  {
    title: "Marketing",
    rows: [{ key: "marketing_emails", label: "Product updates & marketing", line: "Product announcements, launch emails, surveys" }],
  },
];

type EmailLoad = { status: "loading" } | { status: "ready"; prefs: EmailPreferences } | { status: "error"; error: unknown };

function EmailSample() {
  const [load, setLoad] = useState<EmailLoad>({ status: "loading" });
  const [draft, setDraft] = useState<EmailPreferences | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchWithOrganization("/api/user/email-preferences");
        const body = (await res.json()) as { success?: boolean; data?: EmailPreferences; error?: string };
        if (cancelled) return;
        if (res.ok && body.success && body.data) setLoad({ status: "ready", prefs: body.data });
        else setLoad({ status: "error", error: new Error(body.error ?? `The email preferences read answered ${res.status}`) });
      } catch (err) {
        if (cancelled) return;
        setLoad({
          status: "error",
          error: err,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (load.status === "loading") {
    return (
      <>
        {EMAIL_GROUPS.map((g) => (
          <RowGroup key={g.title} title={g.title}>
            <RegionSkeleton count={g.rows.length} twoLine />
          </RowGroup>
        ))}
      </>
    );
  }
  if (load.status === "error") {
    return (
      <ReadFailure error={load.error} what="your email preferences" />
    );
  }

  const prefs = draft ?? load.prefs;
  const dirty = draft !== null && JSON.stringify(draft) !== JSON.stringify(load.prefs);

  return (
    <>
      {EMAIL_GROUPS.map((g) => (
        <RowGroup key={g.title} title={g.title}>
          {g.rows.map((r) => (
            <SettingRow key={r.key} label={r.label} line={r.line}>
              <Switch checked={prefs[r.key]} aria-label={r.label} onCheckedChange={(v) => setDraft({ ...prefs, [r.key]: v })} />
            </SettingRow>
          ))}
        </RowGroup>
      ))}
      {/* Email saves explicitly (it is not on the synced settings engine). */}
      {dirty ? (
        <div className="sticky bottom-3 flex items-center gap-2 rounded-lg border border-border bg-card py-1 pl-3 pr-[9px] shadow-sm">
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">Unsaved changes</span>
          <ControlRow nowrap>
            <Button variant="quiet" onClick={() => setDraft(null)}>
              Discard
            </Button>
            <Button variant="primary" onClick={() => toast.success("Email preferences saved", { description: NOT_SAVED })}>
              Save
            </Button>
          </ControlRow>
        </div>
      ) : null}
    </>
  );
}

/* ------------------------------ Text generation -------------------- */

function TextGenerationSample() {
  // Reads only — the setter half of useSetting is never taken.
  const [savedTone] = useSetting<string>("userPreferences.textGeneration.tone");
  const [savedCreativity] = useSetting<string>("userPreferences.textGeneration.creativityLevel");
  const [savedLanguage] = useSetting<string>("userPreferences.textGeneration.language");
  const [tone, setTone] = useState<string | null>(null);
  const [creativity, setCreativity] = useState<string | null>(null);
  const [language, setLanguage] = useState<string | null>(null);

  return (
    <RowGroup title="Model & style">
      <SettingRow label="Default AI model" line="Answers chat and drafting unless you pick another">
        <Button asChild variant="outline"><Link
          href={settingDoorHref({ scope: "user", tabId: "firstScreen", controlId: CHAT_DEFAULT_MODEL_KNOB })}
        >
          Change
        </Link></Button>
      </SettingRow>
      <SettingRow label="Tone">
        <Select value={tone ?? savedTone} options={TEXT_TONE_OPTIONS} onValueChange={setTone} aria-label="Tone" style={{ width: "9.5rem" }} align="end" />
      </SettingRow>
      <SettingRow label="Creativity">
        <Select value={creativity ?? savedCreativity} options={CREATIVITY_LEVEL_OPTIONS} onValueChange={setCreativity} aria-label="Creativity" style={{ width: "9.5rem" }} align="end" />
      </SettingRow>
      <SettingRow label="Language">
        <Select value={language ?? savedLanguage} options={LANGUAGE_OPTIONS} onValueChange={setLanguage} aria-label="Language" style={{ width: "9.5rem" }} align="end" />
      </SettingRow>
    </RowGroup>
  );
}
