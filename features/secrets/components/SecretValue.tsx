"use client";

/**
 * SecretValue — THE control for a credential value, anywhere one appears.
 *
 * A password manager's whole job is "get me that value", so the reveal (eye)
 * and copy affordances must look and behave identically on the list card, in
 * the detail panel, and on every surface built later. This is that one
 * control; a second reveal/copy implementation is a defect.
 *
 * Security semantics live HERE so they cannot drift per-surface:
 *   - Values are masked by default. Nothing is fetched until the user asks.
 *   - `sealed` has NO human path: no eye, no copy, only a lock. Copying is a
 *     reveal (it puts plaintext on the clipboard), so it is gated by exactly
 *     the same capability as showing.
 *   - `revealable` needs `can_reveal` and goes through the audited reveal
 *     endpoint; `visible` needs `can_use` and resolves.
 *   - Plaintext is held ONLY in `useTransientSecret` component state with a
 *     ~30s auto-clear — never Redux, storage, a query cache, or a URL.
 */
import { useEffect, useState } from "react";
import { Check, Copy, Eye, EyeOff, Loader2, Lock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";
import { toast } from "@/lib/toast";

import { useTransientSecret } from "../vault-hooks";
import { resolveVaultFields, revealVaultField } from "../vault-service";
import type { VaultField, VaultItem } from "../types";

/**
 * Whether a human may see this field's value at all. `sealed` is false for
 * everyone, at every capability level, forever.
 */
export function canShowField(item: VaultItem, field: VaultField): boolean {
  if (!field.is_active) return false;
  if (field.handling === "visible") return item.capabilities.can_use === true;
  if (field.handling === "revealable")
    return item.capabilities.can_reveal === true;
  return false;
}

/**
 * Fetch + hold one field's plaintext. Shared by the eye and the copy button so
 * copying never needs a visible reveal first — two clicks to the clipboard,
 * which is the interaction the whole product is judged on.
 */
export function useFieldSecret(item: VaultItem, field: VaultField) {
  const held = useTransientSecret();
  const [working, setWorking] = useState(false);
  const [copied, setCopied] = useState(false);

  const allowed = canShowField(item, field);
  const sealed = field.handling === "sealed";

  // If the field stops being showable while a value is on screen — sealing it,
  // a capability being revoked, the item being re-fetched with less access —
  // the plaintext goes immediately. Waiting for the 30s timer would leave a
  // just-sealed value visible, which is exactly what sealing forbids.
  const holdClear = held.clear;
  useEffect(() => {
    if (!allowed) holdClear();
  }, [allowed, holdClear]);

  const fetchValue = async (): Promise<string | null> => {
    // `visible` resolves under can_use; `revealable` uses the audited reveal
    // endpoint under can_reveal. `sealed` never reaches here.
    const value =
      field.handling === "visible"
        ? ((
            await resolveVaultFields([
              { item_id: item.id, field_key: field.field_key },
            ])
          )[`${item.id}/${field.field_key}`] ?? null)
        : (await revealVaultField(item.id, field.field_key)).value;
    return typeof value === "string" ? value : null;
  };

  const reveal = async () => {
    if (!allowed) return;
    setWorking(true);
    try {
      const value = await fetchValue();
      if (value === null) throw new Error("No value returned");
      held.hold(value);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setWorking(false);
    }
  };

  const copy = async () => {
    if (!allowed) return;
    let value = held.value;
    if (value === null) {
      setWorking(true);
      try {
        value = await fetchValue();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : String(e));
        return;
      } finally {
        setWorking(false);
      }
    }
    if (value === null) return;
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      toast.error("Your browser blocked clipboard access");
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return {
    value: held.value,
    expiresAt: held.expiresAt,
    clear: held.clear,
    working,
    copied,
    allowed,
    sealed,
    reveal,
    copy,
    toggle: () => (held.value !== null ? held.clear() : void reveal()),
  };
}

/**
 * Seconds until the auto-clear, ticking only while a value is actually held.
 *
 * The reading is stamped with the deadline it was measured against, so a fresh
 * reveal can never briefly show the previous reveal's leftover count — it
 * simply reads nothing until its own first tick lands.
 */
function useSecondsLeft(expiresAt: number | null): number | null {
  const [reading, setReading] = useState<{ at: number; left: number } | null>(
    null,
  );

  useEffect(() => {
    if (expiresAt === null) return;
    const tick = () =>
      setReading({
        at: expiresAt,
        left: Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)),
      });
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [expiresAt]);

  if (expiresAt === null || reading?.at !== expiresAt) return null;
  return reading.left;
}

export interface SecretValueProps {
  item: VaultItem;
  field: VaultField;
  /** `row` shows the value and its controls; `actions` is controls only, for
   *  the list card where the value itself is never rendered. */
  variant?: "row" | "actions";
  /** Show the auto-hide countdown while revealed (detail only — on a list it
   *  would be noise). */
  showCountdown?: boolean;
  className?: string;
  /** Extra controls rendered after copy (edit, settings, delete). */
  children?: React.ReactNode;
}

export function SecretValue({
  item,
  field,
  variant = "row",
  showCountdown = false,
  className,
  children,
}: SecretValueProps) {
  const secret = useFieldSecret(item, field);
  const secondsLeft = useSecondsLeft(secret.expiresAt);
  // Belt and braces with the clear-on-revoke effect: even for the single
  // render before that effect runs, a value the user may no longer see is
  // never painted.
  const revealed = secret.allowed && secret.value !== null;

  const controls = secret.sealed ? (
    // Sealed: a lock and nothing else. There is no unseal control to hide.
    <span
      className="flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground"
      title="Sealed — this value can never be shown to a human. Only trusted server execution can use it."
    >
      <Lock className="h-3.5 w-3.5" />
      Sealed
    </span>
  ) : secret.allowed ? (
    <>
      <Button
        size="sm"
        variant="outline"
        className="h-8 shrink-0 px-2.5 text-xs"
        disabled={secret.working}
        onClick={() => secret.toggle()}
        aria-label={
          revealed ? `Hide ${field.field_key}` : `Show ${field.field_key}`
        }
        title={revealed ? "Hide" : "Show"}
      >
        {secret.working && !revealed ? (
          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
        ) : revealed ? (
          <EyeOff className="mr-1.5 h-3.5 w-3.5" />
        ) : (
          <Eye className="mr-1.5 h-3.5 w-3.5" />
        )}
        {revealed ? "Hide" : "Show"}
      </Button>
      <Button
        size="sm"
        variant="outline"
        className={cn(
          "h-8 shrink-0 px-2.5 text-xs",
          secret.copied && "text-success hover:text-success",
        )}
        disabled={secret.working}
        onClick={() => void secret.copy()}
        aria-label={`Copy ${field.field_key}`}
        title="Copy"
      >
        {secret.copied ? (
          <Check className="mr-1.5 h-3.5 w-3.5" />
        ) : (
          <Copy className="mr-1.5 h-3.5 w-3.5" />
        )}
        {secret.copied ? "Copied" : "Copy"}
      </Button>
    </>
  ) : null;

  if (variant === "actions") {
    return (
      <div className={cn("flex items-center gap-0.5", className)}>
        {controls}
        {children}
      </div>
    );
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <p
        className={cn(
          "min-w-0 flex-1 whitespace-pre-wrap break-all font-mono text-[13px] leading-6",
          revealed ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {revealed
          ? secret.value
          : field.is_active
            ? "Hidden"
            : "Hidden — field is inactive"}
      </p>
      {showCountdown && revealed && secondsLeft !== null && (
        <span
          className="shrink-0 rounded px-1 font-mono text-[11px] tabular-nums text-muted-foreground"
          title="This value hides itself automatically"
        >
          {secondsLeft}s
        </span>
      )}
      {controls}
      {children}
    </div>
  );
}
