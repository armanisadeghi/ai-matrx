"use client";

import { useState } from "react";
import {
  Palette,
  Bell,
  Keyboard,
  Code,
  Brain,
  Mic,
  Volume2,
  Mail,
  Video,
  Image as ImageIcon,
  Type,
  BookOpen,
  Cpu,
  ShieldCheck,
  FileText,
  Database,
  Gem,
  Globe,
  User,
  CircuitBoard,
  Layers,
  Settings as SettingsIcon,
  Eye,
  Sun,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SettingsTree } from "@/components/official/settings/tree/SettingsTree";
import { SettingsDrawerNav } from "@/components/official/settings/tree/SettingsDrawerNav";
import { SettingsBreadcrumb } from "@/components/official/settings/tree/SettingsBreadcrumb";
import type { SettingsTreeNode } from "@/components/official/settings/tree/types";

const nodes: SettingsTreeNode[] = [
  {
    id: "general",
    label: "General",
    icon: SettingsIcon,
    children: [
      {
        id: "general.notifications",
        label: "Notifications",
        icon: Bell,
        description: "Sounds, banners, desktop alerts",
        searchKeywords: ["alerts", "sound", "volume"],
      },
      {
        id: "general.language",
        label: "Language & Region",
        icon: Globe,
        description: "Locale, timezone, currency",
      },
      {
        id: "general.privacy",
        label: "Privacy",
        icon: ShieldCheck,
        description: "Telemetry, personalization",
        badge: "unsaved",
      },
    ],
  },
  {
    id: "appearance",
    label: "Appearance",
    icon: Palette,
    children: [
      {
        id: "appearance.theme",
        label: "Theme",
        icon: Sun,
        description: "Light, dark, system",
      },
      {
        id: "appearance.density",
        label: "Density",
        icon: Layers,
        description: "Spacing preset",
      },
      { id: "appearance.accent", label: "Accent color", icon: Eye },
    ],
  },
  {
    id: "ai",
    label: "AI & Models",
    icon: Brain,
    children: [
      {
        id: "ai.models",
        label: "Models",
        icon: Cpu,
        description: "Active models, providers",
        searchKeywords: ["gpt", "claude", "llm"],
      },
      {
        id: "ai.generation",
        label: "Generation",
        icon: Gem,
        description: "Temperature, thinking mode",
      },
      {
        id: "ai.assistants",
        label: "Assistants",
        icon: CircuitBoard,
        description: "Default assistant settings",
      },
    ],
  },
  {
    id: "editor",
    label: "Editor",
    icon: Code,
    children: [
      { id: "editor.keybindings", label: "Keybindings", icon: Keyboard },
      { id: "editor.formatting", label: "Formatting", icon: Type },
      {
        id: "editor.autocomplete",
        label: "Autocomplete",
        icon: CircuitBoard,
        badge: { label: "Beta", variant: "beta" },
      },
    ],
  },
  {
    id: "voice",
    label: "Voice & Audio",
    icon: Mic,
    children: [
      { id: "voice.input", label: "Voice input", icon: Mic },
      { id: "voice.tts", label: "Text-to-speech", icon: Volume2 },
    ],
  },
  {
    id: "communication",
    label: "Communication",
    icon: Mail,
    children: [
      { id: "communication.email", label: "Email", icon: Mail },
      { id: "communication.video", label: "Video conference", icon: Video },
    ],
  },
  {
    id: "media",
    label: "Media",
    icon: ImageIcon,
    children: [
      { id: "media.images", label: "Image generation", icon: ImageIcon },
      { id: "media.photos", label: "Photo editing", icon: Gem },
    ],
  },
  {
    id: "profile",
    label: "Profile",
    icon: User,
    searchKeywords: ["account", "me"],
  },
  {
    id: "documentation",
    label: "Documentation",
    icon: FileText,
    description: "User guide, API docs",
  },
  {
    id: "advanced",
    label: "Advanced",
    icon: Database,
    children: [
      {
        id: "advanced.database",
        label: "Database",
        icon: Database,
        description: "Connection overrides",
      },
      {
        id: "advanced.flashcards",
        label: "Flashcards",
        icon: BookOpen,
        badge: { label: "Experimental", variant: "experimental" },
      },
      {
        id: "advanced.experimental",
        label: "Experimental flags",
        icon: Gem,
        disabled: true,
      },
    ],
  },
];

export default function SettingsTreeDemoPage() {
  const [activeId, setActiveId] = useState<string | null>("appearance.theme");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const unsavedIds = new Set(["general.privacy", "ai.generation"]);

  const logActivate = (id: string) => {
    setActiveId(id);
    setLog((l) => [
      `${new Date().toLocaleTimeString()} — activated "${id}"`,
      ...l.slice(0, 9),
    ]);
  };

  const renderTab = (node: SettingsTreeNode) => (
    <div className="p-4">
      <h2 className="text-lg font-semibold text-foreground">{node.label}</h2>
      {node.description && (
        <p className="mt-1 text-sm text-muted-foreground">{node.description}</p>
      )}
      <div className="mt-4 rounded-lg border border-border/40 bg-card/30 p-6 text-center">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          Tab placeholder
        </div>
        <div className="mt-1 text-sm text-foreground font-mono">
          id: {node.id}
        </div>
        <div className="mt-4 text-xs text-muted-foreground">
          Phase 5+ will render the real tab component here.
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh bg-background flex flex-col md:flex-row">
      {/* Desktop: left tree, right content. Mobile: drawer button + simplified view. */}
      <div className="hidden md:block w-64 shrink-0 border-r border-border">
        <SettingsTree
          nodes={nodes}
          activeId={activeId}
          onActivate={logActivate}
          unsavedIds={unsavedIds}
        />
      </div>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="flex items-center gap-2 px-4 h-11 border-b border-border shrink-0">
          <Button
            variant="outline"
            size="sm"
            className="md:hidden h-8 text-xs"
            onClick={() => setDrawerOpen(true)}
          >
            Open settings
          </Button>
          <div className="hidden md:block">
            <SettingsBreadcrumb
              nodes={nodes}
              activeId={activeId}
              onNavigate={(id) => (id ? logActivate(id) : setActiveId(null))}
            />
          </div>
          <div className="flex-1" />
          <span className="text-xs text-muted-foreground">
            Phase 2 — tree demo
          </span>
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className="hidden md:block">
            {activeId ? (
              renderTab({
                id: activeId,
                label:
                  nodes
                    .flatMap((n) => (n.children ? [n, ...n.children] : [n]))
                    .find((n) => n.id === activeId)?.label ?? activeId,
                description: nodes
                  .flatMap((n) => (n.children ? n.children : [n]))
                  .find((n) => n.id === activeId)?.description,
              })
            ) : (
              <div className="p-8 text-sm text-muted-foreground">
                Select a setting from the tree.
              </div>
            )}
          </div>

          <div className="md:hidden p-4 space-y-3">
            <div className="rounded-md border border-border bg-card/40 p-4">
              <h3 className="text-sm font-semibold">Mobile demo</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Tap "Open settings" above to launch the drawer push-nav.
              </p>
            </div>
          </div>

          <section className="border-t border-border/50 mt-6 px-4 py-4">
            <h3 className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
              Activation log
            </h3>
            {log.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Click a leaf to log its id here.
              </p>
            ) : (
              <ul className="space-y-1 text-xs font-mono text-muted-foreground">
                {log.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            )}
          </section>
        </main>
      </div>

      <SettingsDrawerNav
        nodes={nodes}
        activeId={activeId}
        onActivate={logActivate}
        renderTab={renderTab}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        unsavedIds={unsavedIds}
      />
    </div>
  );
}
