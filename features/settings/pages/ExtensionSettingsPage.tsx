// app/(authenticated)/settings/extension/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Check, TriangleAlert } from 'lucide-react';
import { Chrome } from '@/components/icons/brand-icons';
import {
  MATRX_EXTEND_STORE_URL,
} from '@/lib/extension-bridge/chrome-rpc';
import { hasOwnBrowserExtension } from '@/lib/extension-bridge/handToOwnBrowser';

/**
 * Is the extension actually in THIS browser?
 *
 * 🚨 This page used to begin at step two. It explained how to connect an
 * extension without ever saying how to get one, and without checking whether
 * the person already had it — so somebody sent here because a capture is
 * waiting on the extension read a page about pairing codes and learned nothing
 * (owner, 2026-09-18: *"Has it checked if I have the extension installed or
 * does it tell me how to get it if not? no."*).
 *
 * Answered by asking the extension, never by a stored flag: an extension can be
 * removed or disabled between one page load and the next.
 */
function InstalledHere() {
  const [state, setState] = useState<'checking' | 'installed' | 'missing'>(
    'checking',
  );

  useEffect(() => {
    let alive = true;
    void hasOwnBrowserExtension().then((found) => {
      if (alive) setState(found ? 'installed' : 'missing');
    });
    return () => {
      alive = false;
    };
  }, []);

  if (state === 'checking') return null;

  if (state === 'installed') {
    return (
      <Card className="flex items-center gap-3 p-3 md:p-4">
        <Check className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
        <p className="text-sm text-muted-foreground">
          The Matrx extension is installed in this browser. If it is asking
          you to sign in, follow the steps below.
        </p>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:gap-3 md:p-4">
      <Button asChild size="sm" className="gap-1.5 self-start sm:self-auto">
        <a href={MATRX_EXTEND_STORE_URL} target="_blank" rel="noopener noreferrer">
          <Chrome className="h-3.5 w-3.5" />
          Add to Chrome
        </a>
      </Button>
      <p className="text-sm text-muted-foreground">
        The Matrx extension is not in this browser yet. Add it, then sign in
        from the extension as described below.
      </p>
    </Card>
  );
}

/**
 * How the extension connects to an account — as it actually works.
 *
 * Settings truth sweep (2026-09-25): this page used to generate a one-time
 * pairing code and tell the person to "paste the code in the extension". The
 * extension has no field for a code and never exchanges one: it signs in
 * through its own sign-in window (OAuth PKCE via chrome.identity —
 * matrx-extend `src/lib/auth/flow.ts`). The code generator was a control that
 * connected nothing, so it is gone; this page now describes the real steps.
 */
export default function ExtensionAuthPage() {
  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-5xl mx-auto space-y-4 md:space-y-6">
      <InstalledHere />
      <Card className="p-4 md:p-6">
        <div className="mb-4">
          <h2 className="text-xl font-semibold mb-1">
            Connect the Chrome extension
          </h2>
          <p className="text-sm text-muted-foreground">
            The extension signs in to your AI Matrx account on its own — no code
            to copy.
          </p>
        </div>
        <div className="bg-muted/50 p-4 rounded-lg space-y-2">
          <h3 className="font-medium text-sm">How it works</h3>
          <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
            <li>Open the AI Matrx extension from your browser toolbar.</li>
            <li>Choose Sign in.</li>
            <li>
              A sign-in window from AI Matrx opens. Sign in if asked, then
              approve the extension.
            </li>
            <li>The window closes and the extension is connected to this account.</li>
          </ol>
        </div>
      </Card>

      <Card className="p-4 md:p-6 bg-yellow-50 dark:bg-yellow-900/10 border-yellow-200 dark:border-yellow-800">
        <h3 className="font-semibold mb-2 flex items-center gap-2">
          <TriangleAlert className="size-4 text-yellow-600 dark:text-yellow-500" aria-hidden="true" />
          Good to know
        </h3>
        <ul className="text-sm text-muted-foreground space-y-1">
          <li>• The extension acts as you, with your account&apos;s access.</li>
          <li>• Only approve a sign-in window you opened from the extension yourself.</li>
          <li>• Signing out in the extension disconnects it from your account.</li>
        </ul>
      </Card>
    </div>
  );
}
