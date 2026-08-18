"use client";

/**
 * Enroll an authenticator onto an existing website-login vault item.
 *
 * Three input routes, all landing in the same sealed write (spec §Enrollment):
 *   1. paste the setup key,
 *   2. paste the otpauth:// URI,
 *   3. upload a QR-code image (decoded + destroyed server-side).
 *
 * 🚨 There is NO code shown here and no "reveal" — the surface is enroll only.
 * The consent copy is shown at the moment of enrollment, in plain language.
 */

import { useState } from "react";
import { KeyRound, QrCode, ClipboardPaste, Upload } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Spinner } from "@/components/ui/spinner";
import type { EnrollableItem } from "../../hooks/use-authenticator";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  enrollable: EnrollableItem[];
  busy: boolean;
  onEnroll: (itemId: string, input: string) => Promise<unknown>;
  onEnrollQr: (itemId: string, image: File) => Promise<unknown>;
}

function ConsentCopy() {
  return (
    <div className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
      <p className="font-medium text-foreground">
        You are giving Matrx the ability to produce this account&apos;s six-digit
        codes.
      </p>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>
          A code is produced only for <strong>this account</strong>, only on{" "}
          <strong>this website</strong>, and only when signing in.
        </li>
        <li>
          The AI agent never sees the secret and never sees the code — our system
          types it.
        </li>
        <li>
          We still stop and ask you before anything sensitive: security settings,
          payments, adding or removing a sign-in method, account recovery.
        </li>
        <li>
          You can turn this off or delete the secret at any time; both take effect
          immediately.
        </li>
        <li>
          Keep your backup codes somewhere we do not hold them — that is how you
          get in without us.
        </li>
      </ul>
    </div>
  );
}

export function AuthenticatorEnrollDialog({
  open,
  onOpenChange,
  enrollable,
  busy,
  onEnroll,
  onEnrollQr,
}: Props) {
  const [itemId, setItemId] = useState<string>("");
  const [pasteValue, setPasteValue] = useState("");
  const [qrFile, setQrFile] = useState<File | null>(null);
  const [mode, setMode] = useState<"paste" | "qr">("paste");

  const reset = () => {
    setItemId("");
    setPasteValue("");
    setQrFile(null);
    setMode("paste");
  };

  const close = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const canSubmit =
    !!itemId &&
    (mode === "paste" ? pasteValue.trim().length > 0 : !!qrFile);

  const submit = async () => {
    if (!canSubmit) return;
    const ok =
      mode === "paste"
        ? await onEnroll(itemId, pasteValue.trim())
        : await onEnrollQr(itemId, qrFile as File);
    if (ok) close(false);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add an authenticator</DialogTitle>
          <DialogDescription>
            Enroll a rotating six-digit code onto one of your saved website
            logins.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <ConsentCopy />

          <div className="space-y-1.5">
            <Label htmlFor="auth-item">Which login</Label>
            {enrollable.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No eligible website logins. Save a website login in your Vault
                first, then add its authenticator here.
              </p>
            ) : (
              <Select value={itemId} onValueChange={setItemId}>
                <SelectTrigger id="auth-item">
                  <SelectValue placeholder="Choose a saved login" />
                </SelectTrigger>
                <SelectContent>
                  {enrollable.map((it) => (
                    <SelectItem key={it.id} value={it.id}>
                      {it.displayName}
                      {it.loginUrls[0] ? ` · ${it.loginUrls[0]}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <Tabs value={mode} onValueChange={(v) => setMode(v as "paste" | "qr")}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="paste" className="gap-1.5">
                <ClipboardPaste className="h-4 w-4" />
                Paste key
              </TabsTrigger>
              <TabsTrigger value="qr" className="gap-1.5">
                <QrCode className="h-4 w-4" />
                Upload QR
              </TabsTrigger>
            </TabsList>

            <TabsContent value="paste" className="space-y-1.5 pt-2">
              <Label htmlFor="auth-key" className="flex items-center gap-1.5">
                <KeyRound className="h-4 w-4" />
                Setup key or otpauth:// link
              </Label>
              <Textarea
                id="auth-key"
                value={pasteValue}
                onChange={(e) => setPasteValue(e.target.value)}
                placeholder="JBSWY3DPEHPK3PXP  —  or  otpauth://totp/..."
                rows={3}
                autoComplete="off"
                spellCheck={false}
              />
              <p className="text-xs text-muted-foreground">
                Copy the &quot;can&apos;t scan it?&quot; text the website shows
                next to its QR code.
              </p>
            </TabsContent>

            <TabsContent value="qr" className="space-y-1.5 pt-2">
              <Label htmlFor="auth-qr" className="flex items-center gap-1.5">
                <Upload className="h-4 w-4" />
                QR-code image
              </Label>
              <input
                id="auth-qr"
                type="file"
                accept="image/*"
                onChange={(e) => setQrFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border file:border-border file:bg-muted file:px-3 file:py-1.5 file:text-sm file:text-foreground hover:file:bg-accent"
              />
              <p className="text-xs text-muted-foreground">
                The image is decoded on our server and destroyed immediately — it
                is never stored.
              </p>
            </TabsContent>
          </Tabs>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => close(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!canSubmit || busy}>
            {busy ? <Spinner className="mr-2 h-4 w-4" /> : null}
            Enroll authenticator
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
