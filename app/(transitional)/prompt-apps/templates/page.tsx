import Link from "next/link";
import { DISPLAY_MODE_OPTIONS } from "@/features/prompt-apps/sample-code/templateRegistry";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Display Mode Templates | Prompt Apps",
  description: "Preview all available display mode templates for prompt apps",
};

const MODE_ICONS: Record<string, string> = {
  form: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
  "form-to-chat":
    "M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z",
  chat: "M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z",
  "centered-input": "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z",
  "chat-with-history":
    "M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10",
};

export default function TemplatesIndexPage() {
  return (
    <div className="h-[calc(100vh-2.5rem)] flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-6 py-8">
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-foreground">
              Display Mode Templates
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Preview each UI pattern for prompt apps. Click a template to see
              it in action with mock data.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {DISPLAY_MODE_OPTIONS.map((mode) => (
              <Link
                key={mode.value}
                href={`/prompt-apps/templates/${mode.value}`}
                className="group block"
              >
                <div className="h-full border border-border rounded-lg p-5 bg-card hover:border-primary/50 hover:shadow-md transition-all">
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <svg
                        className="w-5 h-5 text-primary"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={1.5}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d={MODE_ICONS[mode.value]}
                        />
                      </svg>
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-base font-semibold text-foreground group-hover:text-primary transition-colors">
                        {mode.label}
                      </h2>
                      <code className="text-xs text-muted-foreground font-mono">
                        {mode.value}
                      </code>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {mode.description}
                  </p>
                  <div className="mt-3 flex items-center gap-2">
                    {mode.supportsChat && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                        Chat Follow-ups
                      </span>
                    )}
                    {!mode.supportsChat && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-muted text-muted-foreground">
                        Single Execution
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
