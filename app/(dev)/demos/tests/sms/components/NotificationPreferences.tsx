'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Save, CheckCircle2, AlertCircle, Settings } from 'lucide-react';

interface Preferences {
  phone_number: string | null;
  sms_enabled: boolean;
  dm_notifications: boolean;
  task_notifications: boolean;
  job_completion_notifications: boolean;
  system_alerts: boolean;
  marketing_messages: boolean;
  ai_agent_messages: boolean;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
  timezone: string;
  max_messages_per_hour: number;
  max_messages_per_day: number;
}

export default function NotificationPreferences() {
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const fetchPreferences = async () => {
    setLoading(true);

    try {
      const response = await fetch('/api/sms/preferences');
      const data = await response.json();

      if (response.ok) {
        setPreferences(data.data || data.preferences);
      } else {
        setResult({ success: false, message: data.msg || data.error || 'Failed to fetch preferences' });
      }
    } catch (error) {
      setResult({
        success: false,
        message: error instanceof Error ? error.message : 'Network error',
      });
    } finally {
      setLoading(false);
    }
  };

  const savePreferences = async () => {
    if (!preferences) return;

    setSaving(true);
    setResult(null);

    try {
      const response = await fetch('/api/sms/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(preferences),
      });

      const data = await response.json();

      if (response.ok) {
        setResult({ success: true, message: data.msg || 'Preferences saved successfully!' });
        setPreferences(data.data || data.preferences);
      } else {
        setResult({ success: false, message: data.msg || data.error || 'Failed to save preferences' });
      }
    } catch (error) {
      setResult({
        success: false,
        message: error instanceof Error ? error.message : 'Network error',
      });
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    fetchPreferences();
  }, []);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!preferences) {
    return (
      <Card>
        <CardContent className="py-12">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              No preferences found. They will be created when you save.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-6 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>SMS Notification Preferences</CardTitle>
          <CardDescription>
            Configure your SMS notification settings
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="phone">Phone Number</Label>
            <Input
              id="phone"
              type="tel"
              placeholder="2125551234 or +12125551234"
              value={preferences.phone_number || ''}
              onChange={(e) =>
                setPreferences({ ...preferences, phone_number: e.target.value })
              }
            />
            <p className="text-xs text-muted-foreground">
              Enter 10 digits (US) or include country code (+1 for US)
            </p>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>SMS Notifications Enabled</Label>
              <p className="text-sm text-muted-foreground">
                Master switch for all SMS notifications
              </p>
            </div>
            <Switch
              checked={preferences.sms_enabled}
              onCheckedChange={(checked) =>
                setPreferences({ ...preferences, sms_enabled: checked })
              }
            />
          </div>

          <div className="border-t pt-4 space-y-4">
            <h3 className="font-medium">Notification Types</h3>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Direct Messages</Label>
                <p className="text-sm text-muted-foreground">
                  Get notified of new DMs
                </p>
              </div>
              <Switch
                checked={preferences.dm_notifications}
                onCheckedChange={(checked) =>
                  setPreferences({ ...preferences, dm_notifications: checked })
                }
                disabled={!preferences.sms_enabled}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Task Notifications</Label>
                <p className="text-sm text-muted-foreground">
                  Task assignments and updates
                </p>
              </div>
              <Switch
                checked={preferences.task_notifications}
                onCheckedChange={(checked) =>
                  setPreferences({ ...preferences, task_notifications: checked })
                }
                disabled={!preferences.sms_enabled}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Job Completion</Label>
                <p className="text-sm text-muted-foreground">
                  When jobs are completed
                </p>
              </div>
              <Switch
                checked={preferences.job_completion_notifications}
                onCheckedChange={(checked) =>
                  setPreferences({ ...preferences, job_completion_notifications: checked })
                }
                disabled={!preferences.sms_enabled}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>System Alerts</Label>
                <p className="text-sm text-muted-foreground">
                  Important system notifications
                </p>
              </div>
              <Switch
                checked={preferences.system_alerts}
                onCheckedChange={(checked) =>
                  setPreferences({ ...preferences, system_alerts: checked })
                }
                disabled={!preferences.sms_enabled}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>AI Agent Messages</Label>
                <p className="text-sm text-muted-foreground">
                  Messages from AI agents
                </p>
              </div>
              <Switch
                checked={preferences.ai_agent_messages}
                onCheckedChange={(checked) =>
                  setPreferences({ ...preferences, ai_agent_messages: checked })
                }
                disabled={!preferences.sms_enabled}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Marketing Messages</Label>
                <p className="text-sm text-muted-foreground">
                  Promotional content (opt-in required)
                </p>
              </div>
              <Switch
                checked={preferences.marketing_messages}
                onCheckedChange={(checked) =>
                  setPreferences({ ...preferences, marketing_messages: checked })
                }
                disabled={!preferences.sms_enabled}
              />
            </div>
          </div>

          <div className="border-t pt-4 space-y-4">
            <h3 className="font-medium">Quiet Hours (TCPA Compliance)</h3>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Enable Quiet Hours</Label>
                <p className="text-sm text-muted-foreground">
                  No messages during specified hours
                </p>
              </div>
              <Switch
                checked={preferences.quiet_hours_enabled}
                onCheckedChange={(checked) =>
                  setPreferences({ ...preferences, quiet_hours_enabled: checked })
                }
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="start">Start Time</Label>
                <Input
                  id="start"
                  type="time"
                  value={preferences.quiet_hours_start}
                  onChange={(e) =>
                    setPreferences({ ...preferences, quiet_hours_start: e.target.value })
                  }
                  disabled={!preferences.quiet_hours_enabled}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end">End Time</Label>
                <Input
                  id="end"
                  type="time"
                  value={preferences.quiet_hours_end}
                  onChange={(e) =>
                    setPreferences({ ...preferences, quiet_hours_end: e.target.value })
                  }
                  disabled={!preferences.quiet_hours_enabled}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="timezone">Timezone</Label>
              <Input
                id="timezone"
                value={preferences.timezone}
                onChange={(e) =>
                  setPreferences({ ...preferences, timezone: e.target.value })
                }
                placeholder="America/New_York"
              />
            </div>
          </div>

          <div className="border-t pt-4 space-y-4">
            <h3 className="font-medium">Rate Limits</h3>

            <div className="space-y-2">
              <Label htmlFor="hourly">Max Messages Per Hour</Label>
              <Input
                id="hourly"
                type="number"
                min="1"
                max="100"
                value={preferences.max_messages_per_hour}
                onChange={(e) =>
                  setPreferences({
                    ...preferences,
                    max_messages_per_hour: parseInt(e.target.value) || 10,
                  })
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="daily">Max Messages Per Day</Label>
              <Input
                id="daily"
                type="number"
                min="1"
                max="500"
                value={preferences.max_messages_per_day}
                onChange={(e) =>
                  setPreferences({
                    ...preferences,
                    max_messages_per_day: parseInt(e.target.value) || 50,
                  })
                }
              />
            </div>
          </div>

          <Button onClick={savePreferences} disabled={saving} className="w-full">
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save Preferences
              </>
            )}
          </Button>

          {result && (
            <Alert variant={result.success ? 'default' : 'destructive'}>
              {result.success ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <AlertCircle className="h-4 w-4" />
              )}
              <AlertDescription>{result.message}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
