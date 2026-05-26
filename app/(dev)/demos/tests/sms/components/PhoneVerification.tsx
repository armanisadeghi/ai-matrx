'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Send, CheckCircle2, AlertCircle, Phone } from 'lucide-react';

export default function PhoneVerification() {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string; data?: any } | null>(null);

  const handleSendCode = async () => {
    if (!phoneNumber) {
      setResult({ success: false, message: 'Phone number is required' });
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const response = await fetch('/api/sms/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumber,
          action: 'start',
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setResult({
          success: true,
          message: data.msg || 'Verification code sent! Check your phone.',
          data: data.data,
        });
        setStep('code');
      } else {
        setResult({
          success: false,
          message: data.msg || data.error || 'Failed to send verification code',
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

  const handleVerifyCode = async () => {
    if (!verificationCode) {
      setResult({ success: false, message: 'Verification code is required' });
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const response = await fetch('/api/sms/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumber,
          code: verificationCode,
          action: 'verify',
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setResult({
          success: true,
          message: data.msg || 'Phone number verified successfully!',
          data: data.data,
        });
        setVerificationCode('');
      } else {
        setResult({
          success: false,
          message: data.msg || data.error || 'Invalid verification code',
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

  const handleReset = () => {
    setStep('phone');
    setVerificationCode('');
    setResult(null);
  };

  return (
    <div className="grid gap-6 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>Phone Number Verification</CardTitle>
          <CardDescription>
            Test the OTP verification flow with your phone number
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {step === 'phone' ? (
            <>
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

              <Button
                onClick={handleSendCode}
                disabled={loading || !phoneNumber}
                className="w-full"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending Code...
                  </>
                ) : (
                  <>
                    <Send className="mr-2 h-4 w-4" />
                    Send Verification Code
                  </>
                )}
              </Button>
            </>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="code">Verification Code</Label>
                <Input
                  id="code"
                  type="text"
                  placeholder="123456"
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  disabled={loading}
                  maxLength={6}
                  className="text-center text-2xl tracking-widest"
                />
                <p className="text-xs text-muted-foreground">
                  Enter the 6-digit code sent to {phoneNumber}
                </p>
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={handleVerifyCode}
                  disabled={loading || verificationCode.length !== 6}
                  className="flex-1"
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      Verify Code
                    </>
                  )}
                </Button>
                <Button
                  onClick={handleReset}
                  variant="outline"
                  disabled={loading}
                >
                  Change Number
                </Button>
              </div>

              <Button
                onClick={handleSendCode}
                variant="ghost"
                disabled={loading}
                className="w-full"
              >
                Resend Code
              </Button>
            </>
          )}

          {result && (
            <Alert variant={result.success ? 'default' : 'destructive'}>
              {result.success ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <AlertCircle className="h-4 w-4" />
              )}
              <AlertDescription>
                <div className="font-medium">{result.message}</div>
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
          <CardTitle>How It Works</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <div className="flex items-start gap-2">
            <Phone className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <div>
              <div className="font-medium text-foreground">Step 1: Request Code</div>
              <div>Enter your phone number and click "Send Verification Code"</div>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Send className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <div>
              <div className="font-medium text-foreground">Step 2: Receive SMS</div>
              <div>You'll receive a 6-digit code via SMS (usually within seconds)</div>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <div>
              <div className="font-medium text-foreground">Step 3: Verify</div>
              <div>Enter the code to verify your phone number</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
