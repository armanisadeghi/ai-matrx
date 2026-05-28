"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Database, FlaskConical } from "lucide-react";
import { cn } from "@/styles/themes/utils";
import {
  WhatsAppDataModeProvider,
  type WADataMode,
} from "@/features/whatsapp-clone/hooks/WhatsAppDataModeProvider";
import { useOverlayActions } from "@/features/window-panels/hooks/useOverlay";
import { MessagingInitializer } from "@/features/messaging/components/MessagingInitializer";

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
        <ShellWindowOpener
          userName={userName}
          userAvatarUrl={userAvatarUrl}
        />
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

function ShellWindowOpener({
  userName,
  userAvatarUrl,
}: {
  userName?: string;
  userAvatarUrl?: string | null;
}) {
  const { open } = useOverlayActions();

  useEffect(() => {
    open("whatsappShellWindow", {
      data: {
        userName: userName ?? null,
        userAvatarUrl: userAvatarUrl ?? null,
      },
    });
  }, [open, userName, userAvatarUrl]);

  return null;
}
