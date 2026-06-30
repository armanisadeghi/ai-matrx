import { notFound } from "next/navigation";
import {
  getTemplateForDisplayMode,
  DISPLAY_MODE_OPTIONS,
} from "@/features/agent-apps/sample-code/templates";
import { TemplatePreviewRenderer } from "@/features/agent-apps/components/TemplatePreviewRenderer";
import { TemplateModeActions } from "@/features/agent-apps/components/TemplateModeHeader";
import type { AppDisplayMode } from "@/features/agent-apps/types";
import type { Metadata } from "next";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { RouteModeNav } from "@/features/shell/components/header/RouteModeNav";
import { ChevronLeftTapButton } from "@/components/icons/tap-buttons";

const VALID_MODES: AppDisplayMode[] = [
  "form",
  "form-to-chat",
  "chat",
  "centered-input",
  "chat-with-history",
];

export async function generateMetadata({
  params,
}: {
  params: Promise<{ mode: string }>;
}): Promise<Metadata> {
  const { mode } = await params;
  const option = DISPLAY_MODE_OPTIONS.find((o) => o.value === mode);
  if (!option) return { title: "Template Not Found" };

  return {
    title: `${option.label} Template Preview | Agent Apps`,
    description: option.description,
  };
}

export function generateStaticParams() {
  return VALID_MODES.map((mode) => ({ mode }));
}

export default async function TemplateDemoPage({
  params,
}: {
  params: Promise<{ mode: string }>;
}) {
  const { mode } = await params;

  if (!VALID_MODES.includes(mode as AppDisplayMode)) {
    notFound();
  }

  const displayMode = mode as AppDisplayMode;
  const templateCode = getTemplateForDisplayMode(displayMode);
  const option = DISPLAY_MODE_OPTIONS.find((o) => o.value === displayMode)!;

  const navItems = DISPLAY_MODE_OPTIONS.filter((o) =>
    VALID_MODES.includes(o.value),
  ).map((o) => ({
    name: o.label,
    href: `/agent-apps/templates/${o.value}`,
  }));

  return (
    <>
      <RouteHeader
        left={
          <>
            <ChevronLeftTapButton
              href="/agent-apps/templates"
              ariaLabel="All templates"
              tooltip="All templates"
            />
            <span className="truncate px-1 text-sm font-medium text-[var(--shell-nav-text)]">
              {option.label}
            </span>
          </>
        }
        center={<RouteModeNav items={navItems} />}
        right={
          <TemplateModeActions
            templateCode={templateCode}
            supportsChat={option.supportsChat}
          />
        }
      />

      <div
        className="flex flex-col h-full overflow-hidden"
        style={{ paddingTop: "var(--shell-header-h)" }}
      >
        <div className="flex-shrink-0 px-4 py-1.5 border-b border-border/50 bg-muted/30">
          <p className="text-xs text-muted-foreground">
            {option.description}{" "}
            <span className="text-muted-foreground/60">
              — Responses are simulated mock data. Try interacting with the
              template below.
            </span>
          </p>
        </div>

        <div className="flex-1 overflow-hidden">
          <TemplatePreviewRenderer
            templateCode={templateCode}
            displayMode={displayMode}
            appName={`${option.label} Demo`}
            appTagline={option.description}
          />
        </div>
      </div>
    </>
  );
}
