import { notFound } from "next/navigation";
import Link from "next/link";
import {
  getTemplateForDisplayMode,
  DISPLAY_MODE_OPTIONS,
} from "@/features/prompt-apps/sample-code/templateRegistry";
import { TemplatePreviewRenderer } from "@/features/prompt-apps/components/TemplatePreviewRenderer";
import type { AppDisplayMode } from "@/features/prompt-apps/types/promptAppTypes";
import type { Metadata } from "next";

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
    title: `${option.label} Template Preview | Prompt Apps`,
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

  // Find prev/next for navigation
  const currentIndex = VALID_MODES.indexOf(displayMode);
  const prevMode = currentIndex > 0 ? VALID_MODES[currentIndex - 1] : null;
  const nextMode =
    currentIndex < VALID_MODES.length - 1
      ? VALID_MODES[currentIndex + 1]
      : null;
  const prevOption = prevMode
    ? DISPLAY_MODE_OPTIONS.find((o) => o.value === prevMode)
    : null;
  const nextOption = nextMode
    ? DISPLAY_MODE_OPTIONS.find((o) => o.value === nextMode)
    : null;

  return (
    <div className="h-[calc(100vh-2.5rem)] flex flex-col overflow-hidden">
      {/* Top bar */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-2 border-b border-border bg-card">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/prompt-apps/templates"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            All Templates
          </Link>
          <span className="text-muted-foreground/50">/</span>
          <h1 className="text-sm font-semibold text-foreground truncate">
            {option.label}
          </h1>
          {option.supportsChat && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
              Chat
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {prevOption && (
            <Link
              href={`/prompt-apps/templates/${prevMode}`}
              className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-accent rounded transition-colors"
            >
              {prevOption.label}
            </Link>
          )}
          {nextOption && (
            <Link
              href={`/prompt-apps/templates/${nextMode}`}
              className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-accent rounded transition-colors"
            >
              {nextOption.label}
            </Link>
          )}
        </div>
      </div>

      {/* Description bar */}
      <div className="flex-shrink-0 px-4 py-1.5 border-b border-border/50 bg-muted/30">
        <p className="text-xs text-muted-foreground">
          {option.description}{" "}
          <span className="text-muted-foreground/60">
            — Responses are simulated mock data. Try interacting with the
            template below.
          </span>
        </p>
      </div>

      {/* Template preview area */}
      <div className="flex-1 overflow-hidden">
        <TemplatePreviewRenderer
          templateCode={templateCode}
          displayMode={displayMode}
          appName={`${option.label} Demo`}
          appTagline={option.description}
        />
      </div>
    </div>
  );
}
