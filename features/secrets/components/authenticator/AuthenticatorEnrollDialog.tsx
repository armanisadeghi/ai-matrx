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
 * After saving, the dialog immediately shows the current code so the person can
 * finish the provider's setup. The decoded seed leaves only in the enrollment
 * request body and is never returned.
 */

import { useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
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
import type { AuthenticatorEntry } from "../../authenticator-types";
import { AuthenticatorCode } from "./AuthenticatorCode";

/** Sentinel option value: enroll onto a login created on the spot. */
const NEW_LOGIN = "__new__";

export interface EnrollTarget {
  /** An existing Vault item, or one complete login bundle to create. */
  kind: "existing" | "new";
  itemId?: string;
  displayName?: string;
  loginUrl?: string;
  username?: string;
  password?: string;
}

function normalizeLoginUrl(value: string): string | null {
  const candidate = value.trim();
  if (!candidate) return null;
  try {
    const parsed = new URL(
      /^[a-z][a-z\d+.-]*:/i.test(candidate)
        ? candidate
        : `https://${candidate}`,
    );
    const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
    if (
      parsed.protocol !== "https:" &&
      !(parsed.protocol === "http:" && loopbackHosts.has(parsed.hostname))
    )
      return null;
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return null;
  }
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  enrollable: EnrollableItem[];
  busy: boolean;
  /** Performs the write. `secret` is the raw setup key or otpauth URI. */
  onEnroll: (
    target: EnrollTarget,
    secret: string,
  ) => Promise<AuthenticatorEntry | null>;
}

/** A short, honest consent moment before the seed is stored. */
function ConsentStep({ name }: { name: string }) {
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2.5 rounded-md border border-border bg-muted/40 p-3">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <p className="text-sm text-foreground">
          Matrx will be able to produce the six-digit codes for{" "}
          <span className="font-medium">{name}</span> — the same codes your
          phone app makes — so it can sign in for you without interrupting you.
        </p>
      </div>

      <p className="text-sm text-muted-foreground">
        The AI never sees the setup secret or code. You can turn this off or
        delete it at any time. Keep your backup codes somewhere else.
      </p>
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
  const [step, setStep] = useState<"secret" | "confirm" | "code">("secret");
  const [enrolled, setEnrolled] = useState<AuthenticatorEntry | null>(null);
  const [rawInput, setRawInput] = useState("");
  /** A failure from the QR reader (no code in the image, camera blocked). The
   *  parse failure below is derived, never stored. */
  const [decodeError, setDecodeError] = useState<string | null>(null);
  /** null until the person picks / types — see the derived defaults below. */
  const [chosenItemId, setChosenItemId] = useState<string | null>(null);
  const [typedName, setTypedName] = useState<string | null>(null);
  const [loginUrl, setLoginUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const reset = () => {
    setStep("secret");
    setRawInput("");
    setDecodeError(null);
    setChosenItemId(null);
    setTypedName(null);
    setLoginUrl("");
    setUsername("");
    setPassword("");
    setEnrolled(null);
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
      return {
        parsed: parseEnrollmentInput(text),
        error: null as string | null,
      };
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
  const suggestedName = parsed ? (parsed.issuer ?? parsed.account ?? "") : "";
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
  const normalizedLoginUrl = normalizeLoginUrl(loginUrl);

  const target: EnrollTarget = useMemo(
    () =>
      itemId === NEW_LOGIN
        ? {
            kind: "new",
            displayName: newName.trim(),
            loginUrl: normalizedLoginUrl ?? undefined,
            username: username.trim(),
            password,
          }
        : { kind: "existing", itemId },
    [itemId, newName, normalizedLoginUrl, password, username],
  );

  const targetName =
    itemId === NEW_LOGIN
      ? newName.trim() || (parsed ? describeEnrollment(parsed) : "this account")
      : (enrollable.find((it) => it.id === itemId)?.displayName ??
        "this account");

  const canContinue =
    !!parsed &&
    (itemId !== NEW_LOGIN ||
      (newName.trim().length > 0 &&
        normalizedLoginUrl !== null &&
        username.trim().length > 0 &&
        password.length > 0));

  const submit = async () => {
    if (!parsed || !canContinue) return;
    const result = await onEnroll(target, parsed.raw);
    if (result) {
      setEnrolled(result);
      setStep("code");
    }
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
            {step === "secret"
              ? "Add an authenticator"
              : step === "confirm"
                ? "Turn on codes"
                : "Enter this code in the site"}
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
                      Ready to save
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
                        <Plus className="h-3.5 w-3.5" />A new login
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
                <div className="space-y-3 rounded-md border border-border p-3">
                  <p className="text-sm font-medium text-foreground">
                    New login details
                  </p>
                  <div className="space-y-1.5">
                    <Label htmlFor="auth-new-name">Login name</Label>
                    <Input
                      id="auth-new-name"
                      value={newName}
                      onChange={(e) => setTypedName(e.target.value)}
                      placeholder="GitHub"
                      autoComplete="off"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="auth-new-url">Website</Label>
                    <Input
                      id="auth-new-url"
                      type="url"
                      inputMode="url"
                      value={loginUrl}
                      onChange={(e) => setLoginUrl(e.target.value)}
                      placeholder="github.com/login"
                      autoComplete="url"
                      aria-invalid={
                        loginUrl.length > 0 && normalizedLoginUrl === null
                      }
                    />
                    {loginUrl.length > 0 && normalizedLoginUrl === null ? (
                      <p className="text-xs text-destructive">
                        Enter a valid website address.
                      </p>
                    ) : null}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="auth-new-username">Username or email</Label>
                    <Input
                      id="auth-new-username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="you@example.com"
                      autoComplete="username"
                      data-lpignore="true"
                      data-1p-ignore
                      data-bwignore="true"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="auth-new-password">Password</Label>
                    <Input
                      id="auth-new-password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Password for this website"
                      autoComplete="current-password"
                      data-lpignore="true"
                      data-1p-ignore
                      data-bwignore="true"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    One Vault item will hold this login and its authenticator.
                    The password is encrypted; the authenticator secret is
                    sealed.
                  </p>
                </div>
              ) : null}
            </>
          ) : step === "confirm" ? (
            <ConsentStep name={targetName} />
          ) : enrolled ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Go back to the site and enter this code to finish turning on
                two-factor authentication.
              </p>
              <AuthenticatorCode
                credentialItemId={enrolled.credential_item_id}
                enabled={enrolled.enabled}
              />
            </div>
          ) : null}
        </CredenzaBody>

        <CredenzaFooter>
          {step !== "code" ? (
            <Button
              variant="ghost"
              onClick={() => close(false)}
              disabled={busy}
            >
              Cancel
            </Button>
          ) : null}
          {step === "secret" ? (
            <Button
              onClick={() => setStep("confirm")}
              disabled={!canContinue || busy}
            >
              Continue
            </Button>
          ) : step === "confirm" ? (
            <Button onClick={submit} disabled={busy}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Turn on codes
            </Button>
          ) : (
            <Button onClick={() => close(false)}>Done</Button>
          )}
        </CredenzaFooter>
      </CredenzaContent>
    </Credenza>
  );
}
