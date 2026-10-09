"use client";

// features/spaces/publish/DuplicateFromWeb.tsx — "Duplicate" on a page published to the web (I4) lands here,
// inside the app: signed out, the route's sign-in brings the person back. One press copies the page (and its
// published sub-pages) into the organization they work in — the platform's one organization door
// (ensureOrgId) asks for one when none is chosen, which it does only on a person's own press — then the copy opens.

import { Button, EmptyState } from "@ai-matrx/design-system/controls";
import { Copy } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

import { ensureOrgId } from "@/lib/organizations/ensureOrgId";

import { duplicatePublished } from "./publish-doors";

export function DuplicateFromWeb() {
  const from = useSearchParams()?.get("from") ?? "";
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const duplicate = async () => {
    setBusy(true);
    setError(null);
    try {
      const copyId = await duplicatePublished(from, await ensureOrgId(null));
      // A full load: the sidebar reads the new page with the rest of the tree.
      window.location.replace(`/spaces/${copyId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "We couldn't duplicate this page.");
      setBusy(false);
    }
  };

  if (!from) return <EmptyState icon={<Copy size={20} />} title="No page to duplicate" />;
  return (
    <div className="pt-16">
      <EmptyState
        icon={<Copy size={20} />}
        title={error ? "Not duplicated" : "Duplicate to your workspace"}
        line={error ?? undefined}
        action={
          <Button variant="primary" disabled={busy} onClick={() => void duplicate()} data-testid="confirm-duplicate">
            {busy ? "Duplicating…" : "Duplicate"}
          </Button>
        }
      />
    </div>
  );
}
