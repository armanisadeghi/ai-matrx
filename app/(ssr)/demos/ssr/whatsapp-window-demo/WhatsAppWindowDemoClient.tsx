"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Database, FlaskConical, Plus } from "lucide-react";
import { cn } from "@/styles/themes/utils";
import {
  WhatsAppDataModeProvider,
  type WADataMode,
} from "@/features/whatsapp-clone/hooks/WhatsAppDataModeProvider";
import { WhatsAppShellInner } from "@/features/whatsapp-clone/shell/WhatsAppShellInner";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { MessagingInitializer } from "@/features/messaging/components/MessagingInitializer";

const DEMO_WINDOW_ID = "whatsapp-shell-demo";

interface WhatsAppWindowDemoClientProps {
  initialMode: WADataMode;
  userName?: string;
  userAvatarUrl?: string | null;
}

export function WhatsAppWindowDemoClient({
  initialMode,
  userName,
  userAvatarUrl,
}: WhatsAppWindowDemoClientProps) {
  const router = useRouter();
  const params = useSearchParams();
  const [mode, setMode] = useState<WADataMode>(initialMode);
  const [shellOpen, setShellOpen] = useState(true);

  const flip = () => {
    const next: WADataMode = mode === "mock" ? "live" : "mock";
    setMode(next);
    const usp = new URLSearchParams(params?.toString() ?? "");
    usp.set("mock", next === "mock" ? "1" : "0");
    router.replace(`?${usp.toString()}`, { scroll: false });
  };

  return (
    <WhatsAppDataModeProvider initialMode={mode} key={mode}>
      <div className="relative h-[calc(100dvh-var(--header-height,2.5rem))] w-full overflow-hidden bg-textured">
        {mode === "live" ? <MessagingInitializer /> : null}

        {!shellOpen ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none">
            <p className="text-sm text-muted-foreground/40 select-none">
              WhatsApp window closed — drag, resize, and minimize from the panel
              chrome.
            </p>
          </div>
        ) : null}

        {shellOpen ? (
          <WindowPanel
            id={DEMO_WINDOW_ID}
            title="WhatsApp"
            titleNode={
              <span className="text-[14px] font-medium text-foreground">
                AI Matrx Messenger
              </span>
            }
            width={1200}
            height={720}
            minWidth={1080}
            minHeight={680}
            position="center"
            bodyClassName="p-0"
            onClose={() => setShellOpen(false)}
          >
            <WhatsAppShellInner
              userName={userName}
              userAvatarUrl={userAvatarUrl}
            />
          </WindowPanel>
        ) : null}

        {!shellOpen ? (
          <button
            type="button"
            onClick={() => setShellOpen(true)}
            className="absolute bottom-4 left-4 z-50 flex items-center gap-2 rounded-full bg-card px-3 py-2 text-[12px] font-medium text-foreground shadow-lg border border-border hover:bg-accent transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Open WhatsApp window
          </button>
        ) : null}

        <button
          type="button"
          onClick={flip}
          className={cn(
            "absolute bottom-4 right-4 z-50 flex items-center gap-2 rounded-full px-3 py-2 text-[12px] font-medium shadow-lg transition-colors",
            mode === "mock"
              ? "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground"
              : "bg-emerald-500 text-white hover:bg-emerald-600",
          )}
          aria-label={`Switch to ${mode === "mock" ? "live" : "mock"} data`}
        >
          {mode === "mock" ? (
            <>
              <FlaskConical className="h-3.5 w-3.5" />
              Mock data
            </>
          ) : (
            <>
              <Database className="h-3.5 w-3.5" />
              Live data
            </>
          )}
        </button>
      </div>
    </WhatsAppDataModeProvider>
  );
}
