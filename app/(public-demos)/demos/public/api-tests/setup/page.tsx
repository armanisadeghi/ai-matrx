'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BasicInput } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Key, Check, AlertCircle, Info, ExternalLink } from 'lucide-react';
import { getStoredAdminToken, setStoredAdminToken, clearStoredAdminToken, hasStoredAdminToken } from '@/utils/api-test-auth';
import { toast } from 'sonner';
import Link from 'next/link';

export default function ApiTestSetupPage() {
  const [token, setToken] = useState(() => getStoredAdminToken() || '');
  const [hasToken, setHasToken] = useState(() => hasStoredAdminToken());

  const handleSave = () => {
    if (!token.trim()) {
      toast.error('Token required', {
        description: 'Please enter a valid admin token',
      });
      return;
    }

    setStoredAdminToken(token.trim());
    setHasToken(true);
    toast.success('Token saved successfully', {
      description: 'Your admin token is now stored and will work across all API test pages',
    });
  };

  const handleClear = () => {
    clearStoredAdminToken();
    setToken('');
    setHasToken(false);
    toast.info('Token cleared', {
      description: 'Admin token has been removed from storage',
    });
  };

  const testPages = [
    { name: 'Unified Chat', path: '/demos/api-tests/unified-chat' },
    { name: 'Chat', path: '/demos/api-tests/chat' },
    { name: 'Agent', path: '/demos/api-tests/agent' },
    { name: 'PDF Extract', path: '/demos/api-tests/pdf-extract' },
    { name: 'Health Check', path: '/demos/api-tests/health' },
  ];

  return (
    <div className="min-h-screen bg-textured p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold mb-2">API Test Setup</h1>
          <p className="text-sm text-muted-foreground">
            Configure your admin authentication token for all API test pages
          </p>
        </div>

        {/* Token Configuration Card */}
        <Card className="p-6 space-y-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Key className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">Admin Authentication Token</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              This token will be stored in cookies and used across all API test pages on this domain.
            </p>
          </div>

          {/* Status Badge */}
          <div className="flex items-center gap-2 p-3 rounded-lg border bg-muted/30">
            {hasToken ? (
              <>
                <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
                <span className="text-sm font-medium text-green-600 dark:text-green-400">
                  Token configured
                </span>
              </>
            ) : (
              <>
                <AlertCircle className="h-4 w-4 text-warning" />
                <span className="text-sm font-medium text-warning-foreground">
                  No token configured
                </span>
              </>
            )}
          </div>

          {/* Token Input */}
          <div className="space-y-2">
            <Label htmlFor="token" className="text-sm font-medium">
              Admin Token
            </Label>
            <BasicInput
              id="token"
              type="text"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Enter your admin authentication token"
              className="font-mono"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleSave();
                }
              }}
            />
            <p className="text-xs text-muted-foreground">
              This token authenticates your requests to the Python backend API
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <Button
              onClick={handleSave}
              disabled={!token.trim()}
              className="flex-1"
            >
              <Check className="h-4 w-4 mr-2" />
              Save Token
            </Button>
            {hasToken && (
              <Button
                onClick={handleClear}
                variant="outline"
                className="flex-1"
              >
                Clear Token
              </Button>
            )}
          </div>

          {/* Info Box */}
          <div className="flex gap-3 p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
            <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
            <div className="space-y-1 text-sm">
              <p className="font-medium text-blue-600 dark:text-blue-400">
                Cookie Storage Details
              </p>
              <ul className="space-y-1 text-blue-600/80 dark:text-blue-400/80">
                <li>• Stored at the highest domain level (works across subdomains)</li>
                <li>• Persists for 1 year</li>
                <li>• Automatically used by all API test pages</li>
                <li>• Secure flag enabled on HTTPS</li>
                <li>• Works on both localhost and production</li>
              </ul>
            </div>
          </div>
        </Card>

        {/* Available Test Pages */}
        <Card className="p-6 space-y-4">
          <div>
            <h2 className="text-lg font-semibold mb-2">Available Test Pages</h2>
            <p className="text-sm text-muted-foreground">
              Your token will automatically work on all these pages
            </p>
          </div>

          <div className="grid gap-2">
            {testPages.map((page) => (
              <Link
                key={page.path}
                href={page.path}
                className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent transition-colors group"
              >
                <span className="text-sm font-medium">{page.name}</span>
                <ExternalLink className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
              </Link>
            ))}
          </div>
        </Card>

        {/* Security Note */}
        <Card className="p-4 bg-warning/5 border-warning/20">
          <div className="flex gap-3">
            <AlertCircle className="h-5 w-5 text-warning flex-shrink-0 mt-0.5" />
            <div className="space-y-1 text-sm">
              <p className="font-medium text-warning-foreground">
                Security Note
              </p>
              <p className="text-muted-foreground">
                This token provides admin access to the API. Only share it with trusted team members.
                The token is stored locally in your browser and is not transmitted to any third parties.
              </p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
