"use client";

/**
 * Enroll an authenticator — the same job Google, 1Password, and Bitwarden do,
 * done the way they do it.
 *
 * **Secret first, account second.** The person is standing in front of a
 * website's two-factor screen with a QR code on it; the only thing they can act
 * on is that code. So the code comes first, by whichever route suits the device
 * they are on — paste a screenshot, drop an image, pick a file, or scan with the
 * camera — and it is decoded LOCALLY and shown back to them ("GitHub ·
 * me@x.com") before anything is committed. Which vault login it lands on comes
 * after, prefilled from what the code said, with **Create a new login** right
 * there in the list so the surface never dead-ends on "you have no eligible
 * items" (the failure this replaced).
 *
 * **Two steps, because the second one is a real decision.** Step 1 is the
 * mechanics; step 2 is the consent moment the spec requires (D-14 first
 * capture), where the plain-language explanation of what Matrx can now do
 * lives — not stacked on top of the intake, where it is a wall of text in front
 * of a person who has not decided anything yet.
 *
 * 🚨 No code is shown here and there is no "reveal" — the surface is enroll
 * only (D-15). The decoded secret never leaves this component except as the
 * enrollment request body.
 */

import { useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  KeyRound,
  Loader2,
  Plus,
  ShieldCheck,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Credenza,
  CredenzaBody,
  CredenzaContent,
  CredenzaFooter,
  CredenzaHeader,
  CredenzaTitle,
} from "@/components/ui/credenza-modal/credenza";
import { QrCodeInput } from "@/components/qr/QrCodeInput";
import {
  InvalidEnrollmentInputError,
  describeEnrollment,
  parseEnrollmentInput,
} from "../../authenticator-otpauth";
import type { EnrollableItem } from "../../hooks/use-authenticator";

/** Sentinel option value: enroll onto a login created on the spot. */
const NEW_LOGIN = "__new__";

export interface EnrollTarget {
  /** An existing vault item, or a login to create with this display name. */
  kind: "existing" | "new";
  itemId?: string;
  displayName?: string;
  loginUrl?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  enrollable: EnrollableItem[];
  busy: boolean;
  /** Performs the write. `secret` is the raw setup key or otpauth URI. */
  onEnroll: (target: EnrollTarget, secret: string) => Promise<unknown>;
}

/** The consent moment (spec §"What we tell the person"). Headline + the five
 *  promises stay visible; the honest trade-off paragraph is one click away, so
 *  the step reads as a decision rather than a document. */
function ConsentStep({ name }: { name: string }) {
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2.5 rounded-md border border-border bg-muted/40 p-3">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <p className="text-sm text-foreground">
          Matrx will be able to produce the six-digit codes for{" "}
          <span className="font-medium">{name}</span> — the same codes your phone
          app makes — so it can sign in for you without interrupting you.
        </p>
      </div>

      <ul className="space-y-1.5 text-sm text-muted-foreground">
        <li className="flex gap-2">
          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          Only this account, only on its website, only when signing in.
        </li>
        <li className="flex gap-2">
          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          The AI never sees the secret or the code — our system types it.
        </li>
        <li className="flex gap-2">
          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          We still stop and ask before anything sensitive: security settings,
          payments, sign-in methods, account recovery.
        </li>
        <li className="flex gap-2">
          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          Turn it off or delete the secret at any time — both take effect
          immediately.
        </li>
        <li className="flex gap-2">
          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          Keep your backup codes somewhere we do not hold them.
        </li>
      </ul>

      <details className="group rounded-md border border-border bg-card p-3">
        <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium text-foreground">
          What you are trading away
          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <p className="mt-2 text-sm text-muted-foreground">
          Normally your password and your code are two separate things kept in
          two separate places, so someone who steals one still cannot get in. If
          we hold both, they are in one place. You are trading that separation
          for being signed in without being interrupted. We keep a record of
          every code produced — the account, the site, and the time — never the
          secret and never the code.
        </p>
      </details>
    </div>
  );
}

export function AuthenticatorEnrollDialog({
  open,
  onOpenChange,
  enrollable,
  busy,
  onEnroll,
}: Props) {
  const [step, setStep] = useState<"secret" | "confirm">("secret");
  const [rawInput, setRawInput] = useState("");
  /** A failure from the QR reader (no code in the image, camera blocked). The
   *  parse failure below is derived, never stored. */
  const [decodeError, setDecodeError] = useState<string | null>(null);
  /** null until the person picks / types — see the derived defaults below. */
  const [chosenItemId, setChosenItemId] = useState<string | null>(null);
  const [typedName, setTypedName] = useState<string | null>(null);

  const reset = () => {
    setStep("secret");
    setRawInput("");
    setDecodeError(null);
    setChosenItemId(null);
    setTypedName(null);
  };

  const close = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  /** Parse whatever is in the box on every keystroke / decode, so the person
   *  sees the account name the moment we can read it. */
  const { parsed, error: parseError } = useMemo(() => {
    const text = rawInput.trim();
    if (!text) return { parsed: null, error: null as string | null };
    try {
      return { parsed: parseEnrollmentInput(text), error: null as string | null };
    } catch (err) {
      return {
        parsed: null,
        error:
          err instanceof InvalidEnrollmentInputError
            ? err.message
            : "That setup key could not be read.",
      };
    }
  }, [rawInput]);

  /**
   * Prefill is DERIVED, never stored: the name box and the login picker show
   * what the code implies until the person types or picks something else, and
   * their choice then wins for good. Deriving it (rather than writing state
   * from an effect) is what keeps a later vault refresh from walking over a
   * deliberate choice.
   */
  const suggestedName = parsed
    ? (parsed.issuer ?? parsed.account ?? "")
    : "";
  const suggestedItemId = useMemo(() => {
    const needle = parsed?.issuer?.toLowerCase();
    if (!needle) return null;
    const match = enrollable.find(
      (it) =>
        it.displayName.toLowerCase().includes(needle) ||
        it.loginUrls.some((u) => u.toLowerCase().includes(needle)),
    );
    return match?.id ?? null;
  }, [parsed, enrollable]);

  const itemId = chosenItemId ?? suggestedItemId ?? NEW_LOGIN;
  const newName = typedName ?? suggestedName;

  const target: EnrollTarget = useMemo(
    () =>
      itemId === NEW_LOGIN
        ? { kind: "new", displayName: newName.trim(), loginUrl: undefined }
        : { kind: "existing", itemId },
    [itemId, newName],
  );

  const targetName =
    itemId === NEW_LOGIN
      ? newName.trim() || (parsed ? describeEnrollment(parsed) : "this account")
      : (enrollable.find((it) => it.id === itemId)?.displayName ??
        "this account");

  const canContinue =
    !!parsed && (itemId !== NEW_LOGIN || newName.trim().length > 0);

  const submit = async () => {
    if (!parsed || !canContinue) return;
    const ok = await onEnroll(target, parsed.raw);
    if (ok) close(false);
  };

  return (
    <Credenza open={open} onOpenChange={close}>
      <CredenzaContent className="md:max-w-lg">
        <CredenzaHeader>
          <CredenzaTitle className="flex items-center gap-2">
            {step === "confirm" ? (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setStep("secret")}
                aria-label="Back"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            ) : null}
            {step === "secret" ? "Add an authenticator" : "Turn on codes"}
          </CredenzaTitle>
        </CredenzaHeader>

        <CredenzaBody className="space-y-4">
          {step === "secret" ? (
            <>
              <QrCodeInput
                disabled={busy}
                hint="A screenshot works — the image is read here and never uploaded."
                onDecoded={(text) => {
                  setDecodeError(null);
                  setRawInput(text);
                }}
                onError={setDecodeError}
              />

              <div className="space-y-1.5">
                <Label
                  htmlFor="auth-key"
                  className="flex items-center gap-1.5 text-xs text-muted-foreground"
                >
                  <KeyRound className="h-3.5 w-3.5" />
                  Or type the setup key the site shows
                </Label>
                <Input
                  id="auth-key"
                  value={rawInput}
                  onChange={(e) => {
                    setDecodeError(null);
                    setRawInput(e.target.value);
                  }}
                  placeholder="JBSWY3DPEHPK3PXP"
                  autoComplete="off"
                  spellCheck={false}
                  className="font-mono"
                />
              </div>

              {parsed ? (
                <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 p-2.5 text-sm">
                  <Check className="h-4 w-4 shrink-0 text-primary" />
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">
                      {describeEnrollment(parsed)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {parsed.digits} digits · every {parsed.period}s
                      {parsed.algorithm === "SHA1" ? "" : ` · ${parsed.algorithm}`}
                    </p>
                  </div>
                </div>
              ) : null}

              {decodeError || parseError ? (
                <p className="text-sm text-destructive">
                  {decodeError ?? parseError}
                </p>
              ) : null}

              <div className="space-y-1.5">
                <Label htmlFor="auth-item">Save it on</Label>
                <Select value={itemId} onValueChange={setChosenItemId}>
                  <SelectTrigger id="auth-item">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NEW_LOGIN}>
                      <span className="flex items-center gap-1.5">
                        <Plus className="h-3.5 w-3.5" />
                        A new login
                      </span>
                    </SelectItem>
                    {enrollable.length ? (
                      <>
                        <SelectSeparator />
                        <SelectGroup>
                          <SelectLabel>Your saved logins</SelectLabel>
                          {enrollable.map((it) => (
                            <SelectItem key={it.id} value={it.id}>
                              {it.displayName}
                              {it.loginUrls[0] ? ` · ${it.loginUrls[0]}` : ""}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </>
                    ) : null}
                  </SelectContent>
                </Select>
              </div>

              {itemId === NEW_LOGIN ? (
                <div className="space-y-1.5">
                  <Label htmlFor="auth-new-name">Name this login</Label>
                  <Input
                    id="auth-new-name"
                    value={newName}
                    onChange={(e) => setTypedName(e.target.value)}
                    placeholder="GitHub"
                    autoComplete="off"
                  />
                  <p className="text-xs text-muted-foreground">
                    Creates a Vault login you can add the username and password
                    to afterwards.
                  </p>
                </div>
              ) : null}
            </>
          ) : (
            <ConsentStep name={targetName} />
          )}
        </CredenzaBody>

        <CredenzaFooter>
          <Button variant="ghost" onClick={() => close(false)} disabled={busy}>
            Cancel
          </Button>
          {step === "secret" ? (
            <Button
              onClick={() => setStep("confirm")}
              disabled={!canContinue || busy}
            >
              Continue
            </Button>
          ) : (
            <Button onClick={submit} disabled={busy}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Turn on codes
            </Button>
          )}
        </CredenzaFooter>
      </CredenzaContent>
    </Credenza>
  );
}
