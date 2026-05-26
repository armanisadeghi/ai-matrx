'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Send, CheckCircle2, AlertCircle } from 'lucide-react';

export default function SendSMS() {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [message, setMessage] = useState('');
  const [conversationType, setConversationType] = useState('notification');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string; data?: any } | null>(null);

  const handleSend = async () => {
    if (!phoneNumber || !message) {
      setResult({ success: false, message: 'Phone number and message are required' });
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const response = await fetch('/api/sms/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: phoneNumber,
          message: message,
          conversationType,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setResult({
          success: true,
          message: data.msg || 'SMS sent successfully!',
          data: data.data,
        });
        setMessage('');
      } else {
        setResult({
          success: false,
          message: data.msg || data.error || 'Failed to send SMS',
          data,
        });
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

  return (
    <div className="grid gap-6 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>Send Test SMS</CardTitle>
          <CardDescription>
            Send a test message to any phone number (including your own)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="phone">Phone Number</Label>
            <Input
              id="phone"
              type="tel"
              placeholder="2125551234 or +12125551234"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              disabled={loading}
            />
            <p className="text-xs text-muted-foreground">
              Enter 10 digits (US) or include country code (+1 for US)
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="message">Message</Label>
            <Textarea
              id="message"
              placeholder="Enter your message here..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              disabled={loading}
              rows={4}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground">
              {message.length} characters {message.length > 160 && `(~${Math.ceil(message.length / 160)} segments)`}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="type">Conversation Type</Label>
            <Select value={conversationType} onValueChange={setConversationType} disabled={loading}>
              <SelectTrigger id="type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="notification">Notification</SelectItem>
                <SelectItem value="user_initiated">User Initiated</SelectItem>
                <SelectItem value="system_initiated">System Initiated</SelectItem>
                <SelectItem value="ai_agent">AI Agent</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button
            onClick={handleSend}
            disabled={loading || !phoneNumber || !message}
            className="w-full"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                Send SMS
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
              <AlertDescription>
                <div className="font-medium">{result.message}</div>
                {result.success && (
                  <div className="mt-2 text-sm">
                    <p>✅ Message sent to Twilio successfully!</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Check the Webhook Logs tab to see delivery status.
                      If status shows "undelivered" with error 30034, your A2P campaign needs approval.
                    </p>
                  </div>
                )}
                {result.data && (
                  <pre className="mt-2 text-xs bg-muted/50 p-2 rounded overflow-x-auto">
                    {JSON.stringify(result.data, null, 2)}
                  </pre>
                )}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Quick Test</CardTitle>
          <CardDescription>Send yourself a test message</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button
            variant="outline"
            onClick={() => {
              setPhoneNumber('+1'); // User will complete their number
              setMessage('This is a test message from AI Matrx SMS system.');
              setConversationType('notification');
            }}
            className="w-full"
          >
            Load Test Template
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
