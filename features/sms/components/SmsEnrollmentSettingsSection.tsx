"use client";

import Link from "next/link";
import {
  BellRing,
  CheckCircle2,
  MessageSquareText,
  MessagesSquare,
  Plus,
  Send,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { SettingsButton } from "@/components/official/settings/primitives/SettingsButton";
import { SettingsCheckbox } from "@/components/official/settings/primitives/SettingsCheckbox";
import { SettingsTextInput } from "@/components/official/settings/primitives/SettingsTextInput";
import { SettingsReadOnlyValue } from "@/components/official/settings/layout/SettingsReadOnlyValue";
import { SettingsSection } from "@/components/official/settings/layout/SettingsSection";
import { SettingsCallout } from "@/components/official/settings/layout/SettingsCallout";
import {
  SMS_CONSENT_DISCLOSURE,
  SMS_OPT_IN_PATH,
  SMS_PERSONAL_STAFF_CONSENT_DISCLOSURE,
  SMS_PERSONAL_STAFF_OPT_IN_PATH,
  SMS_PERSONAL_STAFF_PROGRAM_NAME,
  SMS_PRIVACY_PATH,
  SMS_PROGRAM_NAME,
  SMS_TERMS_PATH,
} from "@/features/sms/compliance";
import {
  type SmsProgram,
  useSmsEnrollment,
} from "@/features/sms/hooks/useSmsEnrollment";

/**
 * One consent box per program, never one box for two (carrier rule; see
 * features/sms/compliance.ts). Each box is unchecked by default and records its
 * own consent row.
 */
const SMS_PROGRAMS: ReadonlyArray<{
  key: SmsProgram;
  label: string;
  disclosure: string;
  detailsPath: string;
}> = [
  {
    key: "notifications",
    label: SMS_PROGRAM_NAME,
    disclosure: SMS_CONSENT_DISCLOSURE,
    detailsPath: SMS_OPT_IN_PATH,
  },
  {
    key: "personalStaff",
    label: SMS_PERSONAL_STAFF_PROGRAM_NAME,
    disclosure: SMS_PERSONAL_STAFF_CONSENT_DISCLOSURE,
    detailsPath: SMS_PERSONAL_STAFF_OPT_IN_PATH,
  },
];

function ProgramLinks({ detailsPath }: { detailsPath: string }) {
  return (
    <>
      <Link className="underline" href={detailsPath} target="_blank">
        Program details
      </Link>{" "}
      ·{" "}
      <Link className="underline" href={SMS_TERMS_PATH} target="_blank">
        Terms
      </Link>{" "}
      ·{" "}
      <Link className="underline" href={SMS_PRIVACY_PATH} target="_blank">
        Privacy
      </Link>
    </>
  );
}

/** SMS enrollment composed from the official settings primitives. */
export function SmsEnrollmentSettingsSection() {
  const enrollment = useSmsEnrollment("settings");

  return (
    <>
      <SettingsSection
        title="Text messages"
        description="Verify a mobile number, then opt in to each text program you want. Each program has its own consent."
        icon={MessageSquareText}
      >
        {enrollment.step === "complete" ? (
          <>
            <SettingsReadOnlyValue
              label="Verified mobile number"
              value={enrollment.phoneNumber}
              icon={ShieldCheck}
            />
            <SettingsReadOnlyValue
              label={SMS_PROGRAM_NAME}
              description="Account and workplace notifications."
              value={enrollment.enrolled.notifications ? "On" : "Off"}
              icon={BellRing}
            />
            <SettingsReadOnlyValue
              label={SMS_PERSONAL_STAFF_PROGRAM_NAME}
              description={
                enrollment.personalStaffLegacy
                  ? "Replies and results from your Personal Staff, covered by the consent you gave before programs were separated."
                  : "Replies and results from your Personal Staff."
              }
              value={enrollment.enrolled.personalStaff ? "On" : "Off"}
              icon={MessagesSquare}
            />
            {(!enrollment.enrolled.notifications ||
              !enrollment.enrolled.personalStaff ||
              enrollment.personalStaffLegacy) && (
              <SettingsButton
                label="Add a text program"
                description="Opt this number in to a program separately. You will confirm with a new code."
                actionLabel="Add program"
                actionIcon={Plus}
                kind="outline"
                disabled={enrollment.loading}
                onClick={enrollment.addProgram}
              />
            )}
            <SettingsButton
              label="Turn off all texts"
              description="Stops every AI Matrx text program for this number. You can also reply STOP to any message."
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
              description="Verifying records your consent for each program you checked and turns it on."
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
            {SMS_PROGRAMS.filter(
              (program) =>
                !enrollment.enrolled[program.key] ||
                (program.key === "personalStaff" && enrollment.personalStaffLegacy),
            ).map(
              (program) => (
                <SettingsCheckbox
                  key={program.key}
                  label={program.label}
                  description={
                    <>
                      {program.disclosure} <ProgramLinks detailsPath={program.detailsPath} />
                    </>
                  }
                  checked={enrollment.consents[program.key]}
                  onCheckedChange={(checked) => enrollment.setConsent(program.key, checked)}
                />
              ),
            )}
            <SettingsButton
              label="Verify and enroll"
              description="Each program is optional and not required to use AI Matrx. We send a one-time code before any program starts."
              actionLabel="Send verification code"
              actionIcon={Send}
              loading={enrollment.loading}
              disabled={!enrollment.phoneNumber.trim() || !enrollment.anyConsent}
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
