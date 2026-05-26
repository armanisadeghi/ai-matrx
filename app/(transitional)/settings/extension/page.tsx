// app/(authenticated)/settings/extension/page.tsx
'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Copy, Check, Chrome, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

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
    const minutes = Math.floor(diff / 60);
    const seconds = diff % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-5xl mx-auto space-y-4 md:space-y-6">
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
          <span className="text-yellow-600 dark:text-yellow-500">⚠️</span>
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

