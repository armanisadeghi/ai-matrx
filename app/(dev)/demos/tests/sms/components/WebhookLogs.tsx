'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, RefreshCw, AlertCircle, Webhook, CheckCircle2, XCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface WebhookLog {
  id: string;
  webhook_type: string;
  twilio_sid: string | null;
  raw_payload: any;
  processed: boolean;
  processing_error: string | null;
  created_at: string;
}

export default function WebhookLogs() {
  const [logs, setLogs] = useState<WebhookLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedLog, setSelectedLog] = useState<WebhookLog | null>(null);

  const fetchLogs = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/sms/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'webhook_logs', limit: 50 }),
      });

      const data = await response.json();

      if (response.ok) {
        const logs = data.data?.logs || data.logs || data.data || [];
        setLogs(Array.isArray(logs) ? logs : []);
      } else {
        setError(data.msg || data.error || 'Failed to fetch webhook logs');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    // Auto-refresh every 10 seconds
    const interval = setInterval(fetchLogs, 10000);
    return () => clearInterval(interval);
  }, []);

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'inbound_sms':
        return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
      case 'status_callback':
        return 'bg-green-500/10 text-green-500 border-green-500/20';
      case 'voice':
        return 'bg-purple-500/10 text-purple-500 border-purple-500/20';
      default:
        return 'bg-gray-500/10 text-gray-500 border-gray-500/20';
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Webhook Logs</CardTitle>
              <CardDescription>
                Recent webhook events ({logs.length})
              </CardDescription>
            </div>
            <Button onClick={fetchLogs} variant="outline" size="sm" disabled={loading}>
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {loading && logs.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Webhook className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>No webhook logs yet</p>
              <p className="text-sm">Send or receive an SMS to see webhook events</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[600px] overflow-y-auto">
              {logs.map((log) => (
                <button
                  key={log.id}
                  onClick={() => setSelectedLog(log)}
                  className={`w-full text-left p-3 rounded-lg border transition-colors ${
                    selectedLog?.id === log.id
                      ? 'bg-primary/10 border-primary'
                      : 'bg-card hover:bg-muted/50 border-border'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <Badge variant="outline" className={getTypeColor(log.webhook_type)}>
                      {log.webhook_type}
                    </Badge>
                    <div className="flex items-center gap-2">
                      {log.processed ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      ) : log.processing_error ? (
                        <XCircle className="h-4 w-4 text-red-500" />
                      ) : (
                        <Loader2 className="h-4 w-4 text-yellow-500 animate-spin" />
                      )}
                    </div>
                  </div>
                  {log.twilio_sid && (
                    <div className="text-xs font-mono text-muted-foreground mb-1">
                      {log.twilio_sid}
                    </div>
                  )}
                  {log.processing_error && (
                    <div className="text-xs text-red-500 mb-1">
                      Error: {log.processing_error}
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Webhook Payload</CardTitle>
          <CardDescription>
            {selectedLog ? 'Raw webhook data' : 'Select a log to view payload'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!selectedLog ? (
            <div className="text-center py-8 text-muted-foreground">
              <Webhook className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>Select a webhook log</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Status</span>
                  <Badge
                    variant={
                      selectedLog.processed
                        ? 'default'
                        : selectedLog.processing_error
                        ? 'destructive'
                        : 'secondary'
                    }
                  >
                    {selectedLog.processed
                      ? 'Processed'
                      : selectedLog.processing_error
                      ? 'Failed'
                      : 'Pending'}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Type</span>
                  <span className="text-sm">{selectedLog.webhook_type}</span>
                </div>
                {selectedLog.twilio_sid && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Twilio SID</span>
                    <span className="text-xs font-mono">{selectedLog.twilio_sid}</span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Received</span>
                  <span className="text-sm">
                    {formatDistanceToNow(new Date(selectedLog.created_at), { addSuffix: true })}
                  </span>
                </div>
              </div>

              {selectedLog.processing_error && (
                <Alert variant="destructive">
                  <XCircle className="h-4 w-4" />
                  <AlertDescription>
                    <div className="font-medium">Processing Error</div>
                    <div className="text-sm mt-1">{selectedLog.processing_error}</div>
                  </AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <span className="text-sm font-medium">Raw Payload</span>
                <pre className="text-xs bg-muted p-3 rounded-lg overflow-x-auto max-h-[400px] overflow-y-auto">
                  {JSON.stringify(selectedLog.raw_payload, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
