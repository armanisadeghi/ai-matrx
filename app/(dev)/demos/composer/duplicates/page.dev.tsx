// /demos/composer/duplicates — every other chat input / input piece found beside
// the Smart Agent Input, so the owner can decide each one: move onto the one
// input, or delete. Live ones open where a person meets them; every row links
// to its file. Dates come from git (created = first commit of the file).

import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink, FileCode2 } from "lucide-react";

export const metadata: Metadata = {
  title: "Input Duplicates",
  description: "Every other chat input beside the Smart Agent Input.",
};

const REPO = "https://github.com/armanisadeghi/ai-matrx/blob/main/";

interface Row {
  name: string;
  what: string;
  created: string;
  file: string;
  /** Where a person meets it today; absent = no page renders it. */
  open?: string;
}

const LIVE: Row[] = [
  {
    name: "Pop-up assistant input",
    what: "Own text box, send, stop, variables (opens as a pop-up)",
    created: "2026-04-08",
    file: "../aidream/apps/shared/chat/src/agents/components/agent-widgets/chat-assistant/CompactAssistantInput.tsx",
  },
  {
    name: "Make page describe box",
    what: "Plain text box that starts an agent",
    created: "2026-10-03",
    file: "features/make/describe/DescribeBox.tsx",
    open: "/make",
  },
  {
    name: "Knowledge Ask box",
    what: "Plain text box sending to the knowledge agent",
    created: "2026-09-27",
    file: "features/knowledge/ask/AskPanel.tsx",
    open: "/knowledge",
  },
  {
    name: "AI Work compose box",
    what: "Plain text box, own context bar and rail",
    created: "2026-08-15",
    file: "features/ai-work/compose/components/AiWorkComposer.tsx",
    open: "/work/new",
  },
  {
    name: "Search chat Enter-to-send",
    what: "Hand-built Enter key, not the shared rule",
    created: "2026-06",
    file: "features/rag/components/search/RagSearchExperience.tsx",
    open: "/knowledge/search",
  },
  {
    name: "Agent widgets variables",
    what: "Second renderer of agent variables",
    created: "2026-07",
    file: "../aidream/apps/shared/chat/src/agents/components/widgets/WidgetVariableInputs.tsx",
  },
];

const NO_PAGE: Row[] = [
  {
    name: "Old cx-chat input",
    what: "Send, stop, mic, variables, attachments, + menu",
    created: "2026-03-17",
    file: "../aidream/apps/shared/chat/src/cx-chat/components/user-input/ConversationInput.tsx",
  },
  {
    name: "Old + menu",
    what: "Attach / context / compute / connections menu",
    created: "2026-07-05",
    file: "../aidream/apps/shared/chat/src/agents/components/inputs/smart-input/PlusAttachMenu.tsx",
  },
  {
    name: "Context documents menu",
    what: "Toolbar popover, imported but never drawn",
    created: "2026-06-22",
    file: "../aidream/apps/shared/chat/src/agents/components/inputs/smart-input/ContextDocsMenu.tsx",
  },
  {
    name: "Flash-card AI chat",
    what: "Own chat pop-up in old flash-card code",
    created: "2024-10-02",
    file: "app/(transitional)/_flash-cards/ai/AiChatModal.tsx",
  },
  {
    name: "Prompt box with actions",
    what: "Two copies, only commented-out uses",
    created: "2024-09-02",
    file: "components/ai/PromptInputWithActions.tsx",
  },
  {
    name: "Voice input button",
    what: "A mic button beside the canonical one",
    created: "2025-11-02",
    file: "components/official/VoiceInputButton.tsx",
  },
  {
    name: "Microphone button",
    what: "Another mic button beside the canonical one",
    created: "2025-11-02",
    file: "features/audio/components/MicrophoneButton.tsx",
  },
  {
    name: "Connector strip",
    what: "Old connections strip, demo use only",
    created: "2026-08-18",
    file: "features/connectors/ConnectorStrip.tsx",
  },
  {
    name: "Chat connector strip",
    what: "Old chat connections strip, demo use only",
    created: "2026-08-18",
    file: "features/connectors/ChatConnectorStrip.tsx",
  },
];

function Section({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <div className="overflow-hidden rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">What it is</th>
              <th className="px-3 py-2 font-medium">Created</th>
              <th className="px-3 py-2 font-medium">See it</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.file} className="border-t border-border">
                <td className="px-3 py-2 font-medium text-foreground">{row.name}</td>
                <td className="px-3 py-2 text-muted-foreground">{row.what}</td>
                <td className="px-3 py-2 tabular-nums text-muted-foreground">{row.created}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-3">
                    {row.open ? (
                      <Link href={row.open} className="inline-flex items-center gap-1 text-primary hover:underline">
                        <ExternalLink className="h-3.5 w-3.5" /> Open
                      </Link>
                    ) : null}
                    <a
                      href={`${REPO}${row.file}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground hover:underline"
                    >
                      <FileCode2 className="h-3.5 w-3.5" /> File
                    </a>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function InputDuplicatesPage() {
  return (
    <div className="h-full overflow-y-auto bg-background pt-[var(--shell-header-h,2.75rem)]">
      <div className="mx-auto flex max-w-[1000px] flex-col gap-8 px-4 py-6">
        <Section title="Live: a person can reach these today" rows={LIVE} />
        <Section title="No page uses these" rows={NO_PAGE} />
      </div>
    </div>
  );
}
