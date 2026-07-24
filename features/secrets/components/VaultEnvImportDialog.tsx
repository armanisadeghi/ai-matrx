"use client";

/**
 * VaultEnvImportDialog — bulk `.env` import (paste or file upload) into
 * one-field `env_value` items via aidream `POST /api/vault/items/import-env`.
 */
import { useRef, useState } from "react";
import { FileUp, Loader2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Credenza,
  CredenzaBody,
  CredenzaContent,
  CredenzaHeader,
  CredenzaTitle,
} from "@/components/ui/credenza-modal/credenza";

interface VaultEnvImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  busy: boolean;
  onImport: (envText: string, inject: boolean) => Promise<number>;
}

export function VaultEnvImportDialog({
  open,
  onOpenChange,
  busy,
  onImport,
}: VaultEnvImportDialogProps) {
  const [envText, setEnvText] = useState("");
  const [inject, setInject] = useState(false);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const close = (next: boolean) => {
    onOpenChange(next);
    if (!next) setEnvText("");
  };

  return (
    <Credenza open={open} onOpenChange={close}>
      <CredenzaContent className="md:max-w-xl">
        <CredenzaHeader>
          <CredenzaTitle>Import .env</CredenzaTitle>
        </CredenzaHeader>
        <CredenzaBody className="space-y-3 pb-6">
          <p className="text-xs text-muted-foreground">
            Each <code>KEY=value</code> line becomes one environment-value
            credential; existing entries with the same key are updated in
            place. Comments and blank lines are ignored.
          </p>
          <Textarea
            value={envText}
            onChange={(e) => setEnvText(e.target.value)}
            placeholder={"OPENAI_API_KEY=sk-...\nDATABASE_URL=postgres://..."}
            rows={8}
            className="font-mono text-xs"
            autoComplete="off"
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInput.current?.click()}
            >
              <FileUp className="mr-2 h-4 w-4" />
              Load a .env file
            </Button>
            <input
              ref={fileInput}
              type="file"
              accept=".env,text/plain"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) setEnvText(await file.text());
                e.target.value = "";
              }}
            />
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              Inject into sandboxes
              <Switch
                checked={inject}
                onCheckedChange={setInject}
                aria-label="Inject imported values into sandboxes"
              />
            </label>
          </div>
          <div className="flex justify-end">
            <Button
              size="sm"
              disabled={busy || !envText.trim()}
              onClick={async () => {
                const count = await onImport(envText, inject);
                if (count > 0) close(false);
              }}
            >
              {busy ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              Import
            </Button>
          </div>
        </CredenzaBody>
      </CredenzaContent>
    </Credenza>
  );
}
