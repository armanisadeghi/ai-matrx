// app/(authenticated)/settings/extension/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { formatDurationSeconds } from '@ai-matrx/kit/format';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Copy, Check, RefreshCw, TriangleAlert } from 'lucide-react';
import { Chrome } from '@/components/icons/brand-icons';
import {
  MATRX_EXTEND_STORE_URL,
} from '@/lib/extension-bridge/chrome-rpc';
import { hasOwnBrowserExtension } from '@/lib/extension-bridge/handToOwnBrowser';
import { toast } from "@/lib/toast";

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
          The Matrx extension is installed in this browser. Use the code below
          if it is asking you to sign in.
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
        The Matrx extension is not in this browser yet. Add it, then come back
        here for the code that connects it to your account.
      </p>
    </Card>
  );
}

/**
 * Extension Authentication Page
 * 
 * Allows users to generate codes to authenticate the Chrome extension.
 */
export default function ExtensionAuthPage() {
  const [code, setCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const generateCode = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/auth/extension/generate-code', {
        method: 'POST',
      });

      if (!res.ok) {
        throw new Error('Failed to generate code');
      }

      const data = await res.json();
      setCode(data.code);
      setExpiresAt(data.expiresAt);
      toast.success('Code generated successfully!');
    } catch (error) {
      console.error('Error generating code:', error);
      toast.error('Failed to generate code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const copyCode = () => {
    if (code) {
      navigator.clipboard.writeText(code);
      setCopied(true);
      toast.success('Code copied to clipboard!');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    const now = new Date();
    const diff = Math.floor((date.getTime() - now.getTime()) / 1000);
    return formatDurationSeconds(diff, { style: 'clock' });
  };

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-5xl mx-auto space-y-4 md:space-y-6">
      <InstalledHere />
      <Card className="p-4 md:p-6">
        <div className="mb-6">
          <h2 className="text-xl font-semibold mb-1">
            Connect Chrome Extension
          </h2>
          <p className="text-sm text-muted-foreground">
            Generate a code to authenticate your Chrome extension
          </p>
        </div>

        <div className="space-y-4">
          <div className="bg-muted/50 p-4 rounded-lg space-y-2">
            <h3 className="font-medium text-sm">How it works:</h3>
            <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
              <li>Click "Generate Code" below</li>
              <li>Copy the code that appears</li>
              <li>Open the AI Matrx Chrome extension</li>
              <li>Paste the code in the extension</li>
              <li>You're all set! The code expires in 5 minutes.</li>
            </ol>
          </div>

          {!code ? (
            <Button
              onClick={generateCode}
              disabled={loading}
              size="lg"
              className="w-full"
            >
              {loading ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                'Generate Code'
              )}
            </Button>
          ) : (
            <div className="space-y-4">
              <div className="relative">
                <div className="bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 p-6 rounded-lg border-2 border-blue-200 dark:border-blue-800">
                  <div className="text-center space-y-2">
                    <p className="text-sm text-muted-foreground font-medium">
                      Your Extension Code
                    </p>
                    <div className="font-mono text-3xl font-bold tracking-wider break-all">
                      {code}
                    </div>
                    {expiresAt && (
                      <p className="text-xs text-muted-foreground">
                        Expires in {formatTime(expiresAt)}
                      </p>
                    )}
                  </div>
                </div>
                <Button
                  onClick={copyCode}
                  variant="secondary"
                  size="sm"
                  className="absolute top-2 right-2"
                >
                  {copied ? (
                    <>
                      <Check className="h-4 w-4" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" />
                      Copy
                    </>
                  )}
                </Button>
              </div>

              <Button
                onClick={generateCode}
                variant="outline"
                className="w-full"
                disabled={loading}
              >
                Generate New Code
              </Button>
            </div>
          )}
        </div>
      </Card>

      <Card className="p-4 md:p-6 bg-yellow-50 dark:bg-yellow-900/10 border-yellow-200 dark:border-yellow-800">
        <h3 className="font-semibold mb-2 flex items-center gap-2">
          <TriangleAlert className="size-4 text-yellow-600 dark:text-yellow-500" aria-hidden="true" />
          Security Notice
        </h3>
        <ul className="text-sm text-muted-foreground space-y-1">
          <li>• Codes expire after 5 minutes</li>
          <li>• Each code can only be used once</li>
          <li>• Don't share your code with anyone</li>
          <li>• The extension will have full access to your account</li>
        </ul>
      </Card>
    </div>
  );
}
