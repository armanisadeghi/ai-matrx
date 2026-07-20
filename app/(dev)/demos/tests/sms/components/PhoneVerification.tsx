'use client';

import Link from 'next/link';
import { AlertCircle, CheckCircle2, Loader2, Phone, Send } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  SMS_CONSENT_DISCLOSURE,
  SMS_PRIVACY_PATH,
  SMS_TERMS_PATH,
} from '@/features/sms/compliance';
import { useSmsEnrollment } from '@/features/sms/hooks/useSmsEnrollment';

export default function PhoneVerification() {
  const enrollment = useSmsEnrollment('sms-demo');

  return (
    <div className="grid max-w-2xl gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Phone Number Verification</CardTitle>
          <CardDescription>
            Exercise the same consent and OTP enrollment flow used by production settings.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {enrollment.step === 'complete' ? (
            <>
              <Alert>
                <CheckCircle2 className="h-4 w-4" />
                <AlertDescription>
                  SMS notifications are enabled for {enrollment.phoneNumber}.
                </AlertDescription>
              </Alert>
              <Button
                variant="destructive"
                onClick={enrollment.disableSms}
                disabled={enrollment.loading}
                className="w-full"
              >
                {enrollment.loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Disable SMS notifications
              </Button>
            </>
          ) : enrollment.step === 'phone' ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number</Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="2125551234 or +12125551234"
                  value={enrollment.phoneNumber}
                  onChange={(event) => enrollment.changePhoneNumber(event.target.value)}
                  disabled={enrollment.loading}
                />
              </div>

              <div className="flex items-start gap-3 rounded-md border p-3">
                <Checkbox
                  id="sms-consent"
                  checked={enrollment.consentAccepted}
                  onCheckedChange={(checked) => enrollment.setConsentAccepted(Boolean(checked))}
                  disabled={enrollment.loading}
                />
                <Label htmlFor="sms-consent" className="text-sm font-normal leading-relaxed">
                  {SMS_CONSENT_DISCLOSURE}{' '}
                  <Link className="underline" href={SMS_TERMS_PATH} target="_blank">
                    Terms
                  </Link>{' '}
                  ·{' '}
                  <Link className="underline" href={SMS_PRIVACY_PATH} target="_blank">
                    Privacy
                  </Link>
                </Label>
              </div>

              <Button
                onClick={enrollment.sendCode}
                disabled={
                  enrollment.loading ||
                  !enrollment.phoneNumber.trim() ||
                  !enrollment.consentAccepted
                }
                className="w-full"
              >
                {enrollment.loading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
                )}
                Send Verification Code
              </Button>
            </>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="code">Verification Code</Label>
                <Input
                  id="code"
                  type="text"
                  inputMode="numeric"
                  placeholder="123456"
                  value={enrollment.verificationCode}
                  onChange={(event) => enrollment.changeVerificationCode(event.target.value)}
                  disabled={enrollment.loading}
                  maxLength={6}
                  className="text-center text-2xl tracking-widest"
                />
                <p className="text-xs text-muted-foreground">
                  Enter the six-digit code sent to {enrollment.phoneNumber}.
                </p>
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={enrollment.verifyCode}
                  disabled={enrollment.loading || enrollment.verificationCode.length !== 6}
                  className="flex-1"
                >
                  {enrollment.loading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                  )}
                  Verify Code
                </Button>
                <Button onClick={enrollment.reset} variant="outline" disabled={enrollment.loading}>
                  Change Number
                </Button>
              </div>

              <Button
                onClick={enrollment.sendCode}
                variant="ghost"
                disabled={enrollment.loading}
                className="w-full"
              >
                Resend Code
              </Button>
            </>
          )}

          {enrollment.result && enrollment.step !== 'complete' && (
            <Alert variant={enrollment.result.success ? 'default' : 'destructive'}>
              {enrollment.result.success ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <AlertCircle className="h-4 w-4" />
              )}
              <AlertDescription>{enrollment.result.message}</AlertDescription>
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
            <Phone className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <div className="font-medium text-foreground">Explicit consent</div>
              <div>The enrollment cannot start until the disclosure is accepted.</div>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Send className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <div className="font-medium text-foreground">Verified ownership</div>
              <div>Twilio Verify confirms the user controls the supplied number.</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
