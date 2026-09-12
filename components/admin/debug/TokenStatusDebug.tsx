import { formatDurationMs } from "@ai-matrx/kit/format";
// components/admin/debug/TokenStatusDebug.tsx
'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { createClient } from '@/utils/supabase/client';
import { Clock, RefreshCw, CheckCircle, AlertCircle, Info } from 'lucide-react';

/**
 * TokenStatusDebug
 * 
 * Debug component for administrators to monitor auth session status.
 * Shows session expiry time and current auth state.
 * Token refresh is now handled automatically by the proxy/middleware via getClaims().
 */
export default function TokenStatusDebug() {
  const [status, setStatus] = useState<{
    isActive: boolean;
    email?: string;
    expiresAt?: Date;
    expiresIn?: string;
  } | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  const loadStatus = async () => {
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        setStatus({ isActive: false });
      } else {
        const { data: { session } } = await supabase.auth.getSession();
        const expiresAt = session?.expires_at;
        let expiresIn: string | undefined;

        if (expiresAt) {
          // THE coarse duration voice (@ai-matrx/kit/format): minutes and
          // hours, never seconds — what a token countdown is read at.
          expiresIn = formatDurationMs(expiresAt * 1000 - Date.now(), {
            style: "coarse",
          });
        }

        setStatus({
          isActive: true,
          email: user.email,
          expiresAt: expiresAt ? new Date(expiresAt * 1000) : undefined,
          expiresIn,
        });
      }
    } catch {
      setStatus({ isActive: false });
    }
    setLastUpdate(new Date());
  };

  useEffect(() => {
    loadStatus();
    const interval = setInterval(loadStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Auth Session Status
        </h3>
        <Badge variant={status?.isActive ? 'default' : 'destructive'}>
          {status?.isActive ? 'Active' : 'Inactive'}
        </Badge>
      </div>

      {status?.isActive && (
        <div className="space-y-3 border-t pt-4">
          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">User</div>
            <div className="text-sm font-mono">{status.email}</div>
          </div>

          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">Token Expires At</div>
            <div className="text-sm font-mono">{status.expiresAt?.toLocaleString()}</div>
          </div>

          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">Time Until Expiry</div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              <span className="text-sm font-semibold">{status.expiresIn}</span>
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-2 border-t pt-4">
        <Button
          onClick={loadStatus}
          variant="outline"
          size="sm"
          className="flex items-center gap-2"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh Status
        </Button>
      </div>

      <div className="flex gap-2 items-start text-xs text-muted-foreground border-t pt-4">
        <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
        <div>
          Session tokens are automatically refreshed by the proxy on every request via getClaims().
          No manual refresh needed.
          Last check: {lastUpdate.toLocaleTimeString()}
        </div>
      </div>
    </Card>
  );
}
