"use client";

import { useState } from "react";
import { CopyShortLinkButton } from "@ai-matrx/kit/short-link-react";
import { supabase } from "@/utils/supabase/client";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { Input } from "@/components/ui/input";

// The five-minute proof for the short-link package (kit ./short-link-react):
// everything below the input — the mint call (org-gated shorten_app_url door),
// the URL shape, the clipboard write, the button states — comes from
// @ai-matrx/kit. This page contributes a path field and nothing else.
// Primitive SoR: common-docs/systems/platform/short-links/STATE.md.
export default function ShortLinkKitDemo() {
  const organizationId = useAppSelector(selectOrganizationId);
  const [path, setPath] = useState("/dashboard");
  const [lastUrl, setLastUrl] = useState<string | null>(null);

  return (
    <div className="mx-auto max-w-lg space-y-4 p-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Short-link kit demo</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The button is imported directly from <code>@ai-matrx/kit/short-link-react</code> and
          holds all the logic; this page only supplies a path.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Input
          value={path}
          onChange={(e) => setPath(e.target.value)}
          className="flex-1 font-mono text-sm"
          placeholder="/some/app/path"
        />
        {organizationId ? (
          <CopyShortLinkButton
            key={path}
            client={supabase}
            path={path}
            organizationId={organizationId}
            onCopied={setLastUrl}
          />
        ) : (
          <span className="text-sm text-muted-foreground">Pick an organization first</span>
        )}
      </div>
      {lastUrl ? (
        <p className="text-sm text-muted-foreground">
          Copied: <a className="font-mono underline" href={lastUrl}>{lastUrl}</a>
        </p>
      ) : null}
    </div>
  );
}
