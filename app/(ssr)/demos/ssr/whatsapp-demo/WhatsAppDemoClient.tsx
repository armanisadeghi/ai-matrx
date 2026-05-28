"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Database, FlaskConical } from "lucide-react";
import { cn } from "@/styles/themes/utils";
import {
  WhatsAppDataModeProvider,
  type WADataMode,
} from "@/features/whatsapp-clone/hooks/WhatsAppDataModeProvider";
import { WhatsAppShell } from "@/features/whatsapp-clone/shell/WhatsAppShell";
import { MessagingInitializer } from "@/features/messaging/components/MessagingInitializer";

interface WhatsAppDemoClientProps {
  initialMode: WADataMode;
  userName?: string;
  userAvatarUrl?: string | null;
}

export function WhatsAppDemoClient({
  initialMode,
  userName,
  userAvatarUrl,
}: WhatsAppDemoClientProps) {
  const router = useRouter();
  const params = useSearchParams();
  const [mode, setMode] = useState<WADataMode>(initialMode);

  const flip = () => {
    const next: WADataMode = mode === "mock" ? "live" : "mock";
    setMode(next);
    const usp = new URLSearchParams(params?.toString() ?? "");
    usp.set("mock", next === "mock" ? "1" : "0");
    router.replace(`?${usp.toString()}`, { scroll: false });
  };

  return (
    <div className="relative h-[calc(100dvh-var(--header-height,2.5rem))] w-full overflow-hidden bg-textured">
      <div className="absolute inset-0 flex items-center justify-center p-4 sm:p-6 lg:p-8">
        <div
          className={cn(
            "relative h-full w-full max-w-[1480px]",
            "overflow-hidden rounded-xl border border-border bg-card/98",
            "shadow-2xl backdrop-blur-md",
          )}
        >
          <WhatsAppDataModeProvider initialMode={mode} key={mode}>
            {mode === "live" ? <MessagingInitializer /> : null}
            <WhatsAppShell
              userName={userName}
              userAvatarUrl={userAvatarUrl}
            />
          </WhatsAppDataModeProvider>
        </div>
      </div>

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
  );
}
