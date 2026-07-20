"use client";

import Link from "next/link";
import { CheckCircle2, MessageSquareText, Send, ShieldCheck, XCircle } from "lucide-react";
import { SettingsButton } from "@/components/official/settings/primitives/SettingsButton";
import { SettingsCheckbox } from "@/components/official/settings/primitives/SettingsCheckbox";
import { SettingsTextInput } from "@/components/official/settings/primitives/SettingsTextInput";
import { SettingsReadOnlyValue } from "@/components/official/settings/layout/SettingsReadOnlyValue";
import { SettingsSection } from "@/components/official/settings/layout/SettingsSection";
import { SettingsCallout } from "@/components/official/settings/layout/SettingsCallout";
import {
  SMS_CONSENT_DISCLOSURE,
  SMS_PRIVACY_PATH,
  SMS_TERMS_PATH,
} from "@/features/sms/compliance";
import { useSmsEnrollment } from "@/features/sms/hooks/useSmsEnrollment";

/** SMS enrollment composed from the official settings primitives. */
export function SmsEnrollmentSettingsSection() {
  const enrollment = useSmsEnrollment("settings");

  return (
    <>
      <SettingsSection
        title="Text messages"
        description="Verify a mobile number and explicitly opt in to AI Matrx service and notification texts."
        icon={MessageSquareText}
      >
        {enrollment.step === "complete" ? (
          <>
            <SettingsReadOnlyValue
              label="Verified mobile number"
              description="Recurring AI Matrx SMS notifications are enabled."
              value={enrollment.phoneNumber}
              icon={ShieldCheck}
            />
            <SettingsButton
              label="SMS notifications"
              description="Disable texts here or reply STOP to any AI Matrx message."
              actionLabel="Disable"
              actionIcon={XCircle}
              kind="destructive"
              loading={enrollment.loading}
              onClick={enrollment.disableSms}
              last
            />
          </>
        ) : enrollment.step === "code" ? (
          <>
            <SettingsTextInput
              label="Verification code"
              description={`Enter the six-digit code sent to ${enrollment.phoneNumber}.`}
              value={enrollment.verificationCode}
              onValueChange={enrollment.changeVerificationCode}
              placeholder="123456"
              inputMode="numeric"
              maxLength={6}
            />
            <SettingsButton
              label="Confirm mobile number"
              description="Verification records your consent and enables transactional SMS notifications."
              actionLabel="Verify code"
              actionIcon={CheckCircle2}
              loading={enrollment.loading}
              disabled={enrollment.verificationCode.length !== 6}
              onClick={enrollment.verifyCode}
            />
            <SettingsButton
              label="Need another code?"
              actionLabel="Resend code"
              actionIcon={Send}
              kind="outline"
              loading={enrollment.loading}
              onClick={enrollment.sendCode}
            />
            <SettingsButton
              label="Wrong number?"
              actionLabel="Change number"
              kind="ghost"
              disabled={enrollment.loading}
              onClick={enrollment.reset}
              last
            />
          </>
        ) : (
          <>
            <SettingsTextInput
              label="Mobile number"
              description="Use 10 US digits or an E.164 number such as +12125551234."
              value={enrollment.phoneNumber}
              onValueChange={enrollment.changePhoneNumber}
              placeholder="+12125551234"
              type="tel"
              inputMode="tel"
            />
            <SettingsCheckbox
              label="SMS consent"
              description={
                <>
                  {SMS_CONSENT_DISCLOSURE}{" "}
                  <Link className="underline" href={SMS_TERMS_PATH} target="_blank">
                    Terms
                  </Link>{" "}
                  ·{" "}
                  <Link className="underline" href={SMS_PRIVACY_PATH} target="_blank">
                    Privacy
                  </Link>
                </>
              }
              checked={enrollment.consentAccepted}
              onCheckedChange={enrollment.setConsentAccepted}
            />
            <SettingsButton
              label="Verify and enroll"
              description="We will send a one-time verification code before enabling recurring messages."
              actionLabel="Send verification code"
              actionIcon={Send}
              loading={enrollment.loading}
              disabled={!enrollment.phoneNumber.trim() || !enrollment.consentAccepted}
              onClick={enrollment.sendCode}
              last
            />
          </>
        )}
      </SettingsSection>

      {enrollment.result && (
        <SettingsCallout tone={enrollment.result.success ? "success" : "error"}>
          {enrollment.result.message}
        </SettingsCallout>
      )}
    </>
  );
}
