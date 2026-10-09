"use client";

/**
 * Browsers that can fill saved passwords (access ladder T-30).
 *
 * Every AI Matrx browser extension install that may fill a saved password has
 * its own key, registered the first time it fills. This lists them — newest
 * first, with when each last filled — and turns one off. Turned-off browsers
 * stay listed so the person can see what could fill and when it was stopped.
 * The server audits every registration, fill and turn-off.
 */
import { useCallback, useEffect, useState } from "react";
import { Globe, Loader2, PowerOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Credenza,
  CredenzaBody,
  CredenzaContent,
  CredenzaHeader,
  CredenzaTitle,
} from "@/components/ui/credenza-modal/credenza";
import { ErrorNotice } from "@ai-matrx/design-system";
import {
  listVaultFillDevices,
  revokeVaultFillDevice,
  type VaultFillDevice,
} from "../vault-service";

function when(value: string | null): string {
  if (!value) return "never";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "unknown" : date.toLocaleString();
}

export function VaultFillDevicesDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [devices, setDevices] = useState<VaultFillDevice[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setDevices(await listVaultFillDevices());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const turnOff = async (device: VaultFillDevice) => {
    setBusyId(device.id);
    setError(null);
    try {
      const updated = await revokeVaultFillDevice(device.id);
      setDevices((current) =>
        (current ?? []).map((d) => (d.id === updated.id ? updated : d)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Credenza open={open} onOpenChange={onOpenChange}>
      <CredenzaContent className="sm:max-w-lg">
        <CredenzaHeader>
          <CredenzaTitle>Browsers that can fill passwords</CredenzaTitle>
        </CredenzaHeader>
        <CredenzaBody className="space-y-3 pb-4">
          <p className="text-sm text-muted-foreground">
            Only the AI Matrx browser extension can fill a saved password, and
            only in a browser listed here. Turning one off stops it at once and
            signs the extension out there; it fills again only after you sign
            in there and confirm with your password or passkey.
          </p>
          {error && (
            <ErrorNotice
              size="inline"
              className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm"
              message={error}
            />
          )}
          {devices === null && !error && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading your browsers
            </div>
          )}
          {devices !== null && devices.length === 0 && (
            <p className="rounded-lg border border-border p-3 text-sm text-muted-foreground">
              No browser can fill saved passwords yet. Turn filling on from the
              Vault tab of the AI Matrx extension in the browser you use.
            </p>
          )}
          {devices !== null && devices.length > 0 && (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {devices.map((device) => {
                const off = device.revoked_at !== null;
                return (
                  <li
                    key={device.id}
                    className="flex items-center justify-between gap-3 p-3"
                  >
                    <div className="flex min-w-0 items-start gap-2">
                      <Globe className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">
                          {device.label}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {off
                            ? `Turned off ${when(device.revoked_at)}`
                            : `Last filled ${when(device.last_used_at)} · added ${when(device.registered_at)}`}
                        </p>
                      </div>
                    </div>
                    {!off && (
                      <Button
                        icon={busyId === device.id ? (
                          <Loader2 className="animate-spin" />
                        ) : (
                          <PowerOff />
                        )}
                        variant="outline"
                        className="shrink-0"
                        onClick={() => void turnOff(device)}
                        disabled={busyId !== null}
                      >
                        Turn off
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CredenzaBody>
      </CredenzaContent>
    </Credenza>
  );
}
