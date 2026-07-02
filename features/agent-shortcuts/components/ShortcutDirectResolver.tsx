"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertCircle, ArrowLeft, Loader2 } from "lucide-react";
import { supabase } from "@/utils/supabase/client";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { ShortcutDirectoryMode } from "../utils/shortcut-directory-rows";
import {
  resolveShortcutDirectUrl,
  resolveShortcutEditUrl,
} from "../utils/shortcut-directory-rows";

interface ShortcutLookupRow {
  id: string;
  agent_id: string | null;
}

export interface ShortcutDirectResolverProps {
  shortcutId: string;
  mode: ShortcutDirectoryMode;
}

export function ShortcutDirectResolver({
  shortcutId,
  mode,
}: ShortcutDirectResolverProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function resolveShortcut() {
      setError(null);
      const { data, error: fetchError } = await supabase
        .schema("agent")
        .from("shortcut")
        .select("id, agent_id")
        .eq("id", shortcutId)
        .maybeSingle();

      if (cancelled) return;

      if (fetchError) {
        setError(fetchError.message);
        return;
      }

      if (!data) {
        setError("Shortcut not found or you do not have access.");
        return;
      }

      const row = data as ShortcutLookupRow;
      const target = resolveShortcutEditUrl(
        {
          id: row.id,
          agentId: row.agent_id,
        },
        mode,
      );

      startTransition(() => {
        router.replace(target);
      });
    }

    void resolveShortcut();

    return () => {
      cancelled = true;
    };
  }, [mode, router, shortcutId]);

  const directoryHref =
    mode === "admin"
      ? "/administration/system-agents/shortcuts/all"
      : "/agents/shortcuts/all";

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 p-6 bg-textured">
        <Alert variant="destructive" className="max-w-lg">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href={directoryHref}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to directory
            </Link>
          </Button>
          <Button asChild>
            <Link href={resolveShortcutDirectUrl(shortcutId, mode)}>Retry</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col items-center justify-center gap-3 bg-textured">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground">
        Opening shortcut <code className="font-mono text-xs">{shortcutId}</code>
        ...
      </p>
    </div>
  );
}
