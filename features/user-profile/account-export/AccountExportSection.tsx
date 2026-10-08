"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Spinner } from "@/components/ui/loaders/Spinner";
import { Button } from "@/components/ui/button";
import { ErrorNotice } from "@ai-matrx/design-system";
import { InfoHint } from "@/components/official/InfoHint";
import { SettingsSection } from "@/components/official/settings/layout/SettingsSection";
import { downloadBlob } from "@/utils/file-operations/utils";
import { exportPersonalAccount } from "./service";

export function AccountExportSection() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const download = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const archive = await exportPersonalAccount();
      const blob = new Blob([JSON.stringify(archive, null, 2)], { type: "application/json" });
      if (!downloadBlob(blob, `ai-matrx-account-${archive.manifest.exportedAt.slice(0, 10)}.json`)) {
        throw new Error("Couldn’t download account data. Try again.");
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Couldn’t export account data.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <SettingsSection title="Account data">
      <div className="space-y-3 p-4">
        {error ? <ErrorNotice message={error} size="inline" /> : null}
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" disabled={busy} onClick={() => void download()} icon={busy ? <Spinner size="xs" /> : <Download aria-hidden />}>Download account data</Button>
          <InfoHint label="About account data" text="Includes identity, profile, preferences, personal subscriptions and point usage. Excludes content, company records and credentials." />
        </div>
      </div>
    </SettingsSection>
  );
}
