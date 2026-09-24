"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertCircle, ArrowLeft, Loader2 } from "lucide-react";
import { supabase } from "@/utils/supabase/client";
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import { recordUnavailable } from "@/lib/records/recordUnavailable";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { ShortcutDirectoryMode } from "../utils/shortcut-directory-rows";
import {
  isShortcutUuid,
  resolveShortcutEditUrl,
} from "../utils/shortcut-directory-rows";
import { shortcutTable } from "@/lib/supabase/shortcutStorage";

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
  // The raw failure (not a composed sentence) so <AccessGate> can tell a
  // genuine fault from denied / deleted / never existed.
  const [failure, setFailure] = useState<{ error: unknown } | null>(null);
  const [attempt, setAttempt] = useState(0);
  // Separate from `error` on purpose: a wrong address is not a failed lookup,
  // and the two get different words and different controls.
  const [badAddress, setBadAddress] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function resolveShortcut() {
      setFailure(null);
      setBadAddress(false);

      // This route sits behind `[shortcutId]`. Reserved/static-looking path
      // segments and malformed deep links must never reach a UUID predicate:
      // Postgres rejects them before PostgREST can return an empty result.
      //
      // 🚨 AND THE SCREEN MUST NOT LIE ABOUT IT. This used to answer with the
      // missing-record sentence ("We couldn't open this shortcut"), which
      // claims a shortcut exists and could not be opened. A segment that is not
      // a shortcut id is a WRONG ADDRESS — a person hand-editing the URL or
      // deep-linking a hub tab (`.../shortcuts/categories`) got told their
      // shortcut was broken instead of that they were not on a shortcut page.
      // Hub tabs now have real routes of their own; anything else says what it
      // actually is, and offers only the control that can work.
      if (!isShortcutUuid(shortcutId)) {
        setBadAddress(true);
        return;
      }

      const { data, error: fetchError } = await shortcutTable(supabase)
        .select("id, agent_id")
        .eq("id", shortcutId)
        .maybeSingle();

      if (cancelled) return;

      if (fetchError) {
        setFailure({ error: fetchError });
        return;
      }

      if (!data) {
        setFailure({
          error: recordUnavailable({
            entity: "shortcut",
            reason: "unknown",
            recordId: shortcutId,
            relation: "agent.shortcut",
          }),
        });
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
  }, [mode, router, shortcutId, attempt]);

  const directoryHref =
    mode === "admin"
      ? "/administration/agents/system-agents/shortcuts/all"
      : "/agents/shortcuts/all";

  if (badAddress) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 p-6 bg-textured">
        <Alert variant="destructive" className="max-w-lg">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <code className="font-mono text-xs">{shortcutId}</code> is not a
            shortcut id, so there is no shortcut at this address. If you were
            looking for a section of this area, open it from the directory.
          </AlertDescription>
        </Alert>
        {/* No Retry here: retrying the same wrong address can only fail, and a
            control that cannot work is worse than no control at all. */}
        <Button variant="outline" asChild>
          <Link href={directoryHref}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to directory
          </Link>
        </Button>
      </div>
    );
  }

  if (failure) {
    return (
      <div className="h-full overflow-hidden">
        <AccessGate
          token="agent_shortcut"
          id={shortcutId}
          error={failure.error}
          onRetry={() => setAttempt((n) => n + 1)}
          fallbackHref={directoryHref}
          fallbackLabel="Shortcut directory"
        />
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
