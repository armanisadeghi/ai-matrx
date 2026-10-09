"use client";

import { useClipboard } from "@ai-matrx/kit/clipboard";
import { copyNotify } from "@/lib/clipboard/copy-notify";
import { useEffect, useRef, useState } from "react";
import { Copy, Eye, EyeOff, RefreshCw } from "lucide-react";
import {
  generateCredentialSecret,
  type CredentialGenerationOptions,
} from "@ai-matrx/kit/credential-generator";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@ai-matrx/design-system/controls";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/lib/toast";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import {
  Credenza,
  CredenzaBody,
  CredenzaContent,
  CredenzaHeader,
  CredenzaTitle,
} from "@/components/ui/credenza-modal/credenza";
import { fetchVaultGeneratorLimits } from "../generator-limits";

const TTL_MS = 30_000;
type Candidate = { value: string; kind: "password" | "passphrase" };

export function isEligibleVaultPasswordField(input: {
  fieldKey: string;
  active: boolean;
  editable: boolean;
  handling: "visible" | "revealable" | "sealed";
  protectedExecution: boolean;
  canEdit: boolean;
}): boolean {
  return (
    input.fieldKey === "password" &&
    input.active &&
    input.editable &&
    input.canEdit &&
    !input.protectedExecution &&
    input.handling !== "sealed"
  );
}

interface VaultPasswordGeneratorProps {
  targetKey: string;
  eligible: boolean;
  onUse: (value: string) => void;
}

/** A staged secret stays local to this component until the person explicitly uses it. */
export function VaultPasswordGenerator({
  targetKey,
  eligible,
  onUse,
}: VaultPasswordGeneratorProps) {
  const { copyText } = useClipboard({
    notify: copyNotify,
  });
  const userId = useAppSelector(selectUserId);
  const organizationId = useAppSelector(selectOrganizationId);
  const [open, setOpen] = useState(false);
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [kind, setKind] = useState<"password" | "passphrase">("password");
  const [password, setPassword] = useState({
    length: 24,
    lowercase: true,
    uppercase: true,
    digits: true,
    symbols: true,
    excludeAmbiguous: true,
  });
  const [passphrase, setPassphrase] = useState({
    wordCount: 6,
    separator: "-" as "-" | " " | ".",
    capitalize: false,
    appendDigit: false,
  });
  const generationRef = useRef(0);
  const contextRef = useRef("");
  const context = `${userId ?? ""}:${organizationId ?? ""}:${targetKey}:${eligible}`;
  contextRef.current = context;

  const clear = () => {
    generationRef.current += 1;
    setCandidate(null);
    setRevealed(false);
  };
  useEffect(() => clear, [context]);
  useEffect(() => {
    if (!candidate) return;
    const timeout = window.setTimeout(clear, TTL_MS);
    return () => window.clearTimeout(timeout);
  }, [candidate]);
  useEffect(
    () => () => {
      generationRef.current += 1;
    },
    [],
  );

  if (!eligible) return null;
  const options: CredentialGenerationOptions =
    kind === "password" ? { kind, ...password } : { kind, ...passphrase };
  const changeOptions = (next: typeof kind) => {
    setKind(next);
    clear();
  };
  const generate = async () => {
    if (!userId || !organizationId || !eligible) {
      clear();
      toast.error(
        "Password generation is unavailable until your account and organization are ready.",
      );
      return;
    }
    const snapshot = contextRef.current;
    clear();
    const generation = ++generationRef.current;
    try {
      const limits = await fetchVaultGeneratorLimits(organizationId, userId);
      if (
        generation !== generationRef.current ||
        snapshot !== contextRef.current ||
        !eligible
      )
        return;
      const result = generateCredentialSecret(options, limits);
      if (!result.ok) {
        toast.error(
          "Password generation could not safely create that option set.",
        );
        return;
      }
      if (
        snapshot !== contextRef.current ||
        generation !== generationRef.current
      )
        return;
      setCandidate({ value: result.value, kind: result.kind });
    } catch (error) {
      if (
        generation === generationRef.current &&
        snapshot === contextRef.current
      )
        toast.error(
          error instanceof Error
            ? error.message
            : "Password generation is unavailable.",
        );
    }
  };
  const copy = async () => {
    if (
      !candidate ||
      contextRef.current !== context ||
      !userId ||
      !organizationId
    )
      return;
    const snapshot = contextRef.current;
    // Keep the candidate on failure: clearing it would lose the only copy.
    if (
      !(await copyText(
        candidate.value,
        "Copied. This copy remains in your clipboard until you replace it.",
        "Could not copy the generated value. Reveal it and copy it yourself.",
      ))
    )
      return;
    clear();
    if (snapshot !== contextRef.current) {
      toast.warning(
        "A prior copy may remain in your clipboard after the credential changed.",
      );
      return;
    }
  };
  const use = () => {
    if (!candidate || contextRef.current !== context || !eligible) return;
    const value = candidate.value;
    clear();
    onUse(value);
    setOpen(false);
  };
  return (
    <>
      <Button
        icon={<RefreshCw />}
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
      >
        Generate
      </Button>
      <Credenza
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) clear();
        }}
      >
        <CredenzaContent className="md:max-w-lg">
          <CredenzaHeader>
            <CredenzaTitle>Generate password</CredenzaTitle>
          </CredenzaHeader>
          <CredenzaBody className="space-y-4 pb-6">
            <div className="flex gap-2">
              <Button
                type="button"
                variant={kind === "password" ? "primary" : "outline"}
                onClick={() => changeOptions("password")}
              >
                Password
              </Button>
              <Button
                type="button"
                variant={kind === "passphrase" ? "primary" : "outline"}
                onClick={() => changeOptions("passphrase")}
              >
                Passphrase
              </Button>
            </div>
            {kind === "password" ? (
              <div className="space-y-3">
                <Label>
                  Length{" "}
                  <Input
                    type="number"
                    value={password.length}
                    onChange={(e) => {
                      setPassword({
                        ...password,
                        length: Number(e.target.value),
                      });
                      clear();
                    }}
                  />
                </Label>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {(
                    ["lowercase", "uppercase", "digits", "symbols"] as const
                  ).map((key) => (
                    <label key={key} className="flex items-center gap-2">
                      <Checkbox
                        checked={password[key]}
                        onCheckedChange={(checked) => {
                          setPassword({ ...password, [key]: checked === true });
                          clear();
                        }}
                      />
                      {key}
                    </label>
                  ))}
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={password.excludeAmbiguous}
                    onCheckedChange={(checked) => {
                      setPassword({ ...password, excludeAmbiguous: checked });
                      clear();
                    }}
                  />
                  Exclude ambiguous characters
                </label>
              </div>
            ) : (
              <div className="space-y-3">
                <Label>
                  Words{" "}
                  <Input
                    type="number"
                    value={passphrase.wordCount}
                    onChange={(e) => {
                      setPassphrase({
                        ...passphrase,
                        wordCount: Number(e.target.value),
                      });
                      clear();
                    }}
                  />
                </Label>
                <label className="text-sm">
                  Separator{" "}
                  <select
                    className="ml-2 rounded border bg-background p-1"
                    value={passphrase.separator}
                    onChange={(e) => {
                      setPassphrase({
                        ...passphrase,
                        separator: e.target.value as "-" | " " | ".",
                      });
                      clear();
                    }}
                  >
                    <option value="-">Hyphen</option>
                    <option value=" ">Space</option>
                    <option value=".">Period</option>
                  </select>
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={passphrase.capitalize}
                    onCheckedChange={(checked) => {
                      setPassphrase({ ...passphrase, capitalize: checked });
                      clear();
                    }}
                  />
                  Capitalize words
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={passphrase.appendDigit}
                    onCheckedChange={(checked) => {
                      setPassphrase({ ...passphrase, appendDigit: checked });
                      clear();
                    }}
                  />
                  Add trailing digit
                </label>
              </div>
            )}
            {candidate && (
              <div className="space-y-2 rounded-md border border-border p-3">
                <p className="break-all font-mono text-sm">
                  {revealed ? candidate.value : "••••••••••••••••"}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    icon={revealed ? (
                      <EyeOff />
                    ) : (
                      <Eye />
                    )}
                    type="button"
                    variant="outline"
                    onClick={() => setRevealed((value) => !value)}
                  >
                    {revealed ? "Hide" : "Reveal"}
                  </Button>
                  <Button
                    icon={<Copy />}
                    type="button"
                    variant="outline"
                    onClick={() => void copy()}
                  >
                    Copy
                  </Button>
                  <Button variant="primary" type="button" onClick={use}>
                    Use
                  </Button>
                </div>
              </div>
            )}
            <Button variant="primary" type="button" onClick={() => void generate()}>
              {candidate ? "Generate another" : "Generate"}
            </Button>
          </CredenzaBody>
        </CredenzaContent>
      </Credenza>
    </>
  );
}
