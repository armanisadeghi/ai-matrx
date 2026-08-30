import Link from "next/link";
import { createRouteMetadata } from "@/utils/route-metadata";
import { siteConfig } from "@/config/extras/site";
import {
  SMS_CONSENT_DISCLOSURE,
  SMS_HR_SENDER_PHONE,
  SMS_PRIVACY_PATH,
  SMS_PROGRAM_NAME,
  SMS_SENDER_PHONE,
  SMS_SETTINGS_PATH,
  SMS_SUPPORT_EMAIL,
  SMS_TERMS_PATH,
} from "@/features/sms/compliance";

export const metadata = createRouteMetadata("/sms", {
  title: "SMS Notifications",
  description:
    "How users opt in to AI Matrx SMS notifications and manage consent.",
  canonicalPath: "/sms",
});

export default function SmsProgramPage() {
  const signInHref = `/login?redirectTo=${encodeURIComponent(SMS_SETTINGS_PATH)}`;

  return (
    <div className="bg-background">
      <article className="prose prose-neutral mx-auto max-w-3xl px-4 py-8 dark:prose-invert sm:px-6 sm:py-12">
        <h1>{SMS_PROGRAM_NAME}</h1>
        <p>
          AI Matrx account holders can choose to receive transactional and
          service-related text messages, including task reminders,
          job-completion alerts, direct-message notifications, system alerts,
          and requested AI-agent responses. When AI Matrx is used through an
          employer, users may also choose workforce notifications such as shift
          assignments and reminders, schedule changes, timekeeping and
          missing-punch alerts, leave decisions, training and credential
          reminders, onboarding tasks, and other non-marketing workplace
          updates.
        </p>
        <p>
          <strong>Legal operator:</strong> AI Matrx is a technology service
          owned and operated by {siteConfig.legalOperatorName}. The registered
          business website is{" "}
          <a
            href={siteConfig.legalOperatorUrl}
            rel="external noopener"
            target="_blank"
          >
            {siteConfig.legalOperatorUrl}
          </a>
          .
        </p>

        <h2>How to opt in</h2>
        <ol>
          <li>
            <Link href={signInHref}>Sign in to AI Matrx</Link> and open{" "}
            <strong>User Settings</strong>.
          </li>
          <li>
            Go to <strong>Communication → Messaging → Text messages</strong>.
          </li>
          <li>Enter the mobile number that should receive messages.</li>
          <li>
            Read and affirmatively check the SMS consent box. The box is
            unchecked by default and SMS consent is not required to create or
            use an AI Matrx account.
          </li>
          <li>
            Select <strong>Send verification code</strong>, then enter the
            six-digit code sent by Twilio Verify. SMS notifications are enabled
            only after successful verification.
          </li>
          <li>
            Open <strong>General → Notifications</strong> to choose which
            notification events may use SMS. Each event shows its default until
            the user changes it.
          </li>
        </ol>
        <p>
          Existing users can open the{" "}
          <Link href={SMS_SETTINGS_PATH}>SMS enrollment settings</Link>{" "}
          directly.
        </p>

        <h2>Consent disclosure</h2>
        <blockquote>{SMS_CONSENT_DISCLOSURE}</blockquote>

        <h2>Program details</h2>
        <ul>
          <li>
            <strong>Sender:</strong> {siteConfig.legalOperatorName}, using the
            AI Matrx product name
          </li>
          <li>
            <strong>AI Matrx account and assistant number:</strong>{" "}
            {SMS_SENDER_PHONE}
          </li>
          <li>
            <strong>Employer and workforce notification number:</strong>{" "}
            {SMS_HR_SENDER_PHONE}
          </li>
          <li>
            <strong>Message frequency:</strong> Varies based on the
            notifications and agent interactions the user enables.
          </li>
          <li>
            <strong>Cost:</strong> Message and data rates may apply.
          </li>
          <li>
            <strong>Opt out:</strong> Reply <strong>STOP</strong> at any time or
            disable SMS in User Settings.
          </li>
          <li>
            <strong>Help:</strong> Reply <strong>HELP</strong> or email{" "}
            <a href={`mailto:${SMS_SUPPORT_EMAIL}`}>{SMS_SUPPORT_EMAIL}</a>.
          </li>
        </ul>

        <p>
          Review the <Link href={SMS_TERMS_PATH}>SMS Terms and Conditions</Link>{" "}
          and <Link href={SMS_PRIVACY_PATH}>Privacy Policy</Link>.
        </p>
      </article>
    </div>
  );
}
