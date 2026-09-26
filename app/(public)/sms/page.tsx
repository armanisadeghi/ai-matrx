import Link from "next/link";
import { createRouteMetadata } from "@/utils/route-metadata";
import { siteConfig } from "@/config/extras/site";
import {
  SMS_CONSENT_DISCLOSURE,
  SMS_FIRST_PARTY_SENDER_PHONE,
  SMS_HR_SENDER_PHONE,
  SMS_PERSONAL_STAFF_OPT_IN_PATH,
  SMS_PERSONAL_STAFF_PROGRAM_NAME,
  SMS_PERSONAL_STAFF_SENDER_PHONE,
  SMS_PRIVACY_PATH,
  SMS_PROGRAM_NAME,
  SMS_SENDER_PHONE,
  SMS_SETTINGS_PATH,
  SMS_SUPPORT_EMAIL,
  SMS_TERMS_PATH,
} from "@/features/sms/compliance";

export const metadata = createRouteMetadata("/sms", {
  title: "SMS Programs",
  description:
    "The AI Matrx text message programs, how to opt in to each one separately, and how to stop.",
  canonicalPath: "/sms",
});

export default function SmsProgramPage() {
  const signInHref = `/login?redirectTo=${encodeURIComponent(SMS_SETTINGS_PATH)}`;

  return (
    <div className="bg-background">
      <article className="prose prose-neutral mx-auto max-w-3xl px-4 py-8 dark:prose-invert sm:px-6 sm:py-12">
        <h1>AI Matrx text message programs</h1>
        <p>
          AI Matrx runs two separate text message programs. Each has its own
          consent: a separate checkbox, unchecked by default, that covers that
          program only. Opting in to one never opts you in to the other, and
          neither is required to create or use an AI Matrx account. AI Matrx
          does not send marketing text messages.
        </p>
        <ul>
          <li>
            <a href="#notifications">{SMS_PROGRAM_NAME}</a> — account and
            workplace notifications (this page).
          </li>
          <li>
            <Link href={SMS_PERSONAL_STAFF_OPT_IN_PATH}>
              {SMS_PERSONAL_STAFF_PROGRAM_NAME}
            </Link>{" "}
            — replies from the AI assistants you direct by text (its own page).
          </li>
        </ul>

        <h2 id="notifications">{SMS_PROGRAM_NAME}</h2>
        <p>
          AI Matrx account holders can choose to receive transactional and
          service-related text messages, including task reminders,
          job-completion alerts, direct-message notifications, and system
          alerts. When AI Matrx is used through an employer, this program also
          covers workforce notifications such as shift assignments and
          reminders, schedule changes, timekeeping and missing-punch alerts,
          leave decisions, training and credential reminders, onboarding tasks,
          and other non-marketing workplace updates.
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

        <h3>How to opt in</h3>
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
            Check the box labeled <strong>AI Matrx notifications</strong>. It
            is unchecked by default, separate from the Personal Staff box, and
            not required to create or use an AI Matrx account.
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

        <h3>Consent disclosure</h3>
        <blockquote>{SMS_CONSENT_DISCLOSURE}</blockquote>

        <h3>Program details</h3>
        <ul>
          <li>
            <strong>Sender:</strong> {siteConfig.legalOperatorName}, using the
            AI Matrx product name
          </li>
          <li>
            <strong>AI Matrx account number:</strong> {SMS_SENDER_PHONE}
          </li>
          <li>
            <strong>Employer and workforce notification number:</strong>{" "}
            {SMS_HR_SENDER_PHONE}
          </li>
          <li>
            <strong>Product notification number:</strong>{" "}
            {SMS_FIRST_PARTY_SENDER_PHONE}
          </li>
          <li>
            <strong>Message frequency:</strong> Varies based on the
            notifications the user enables.
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

        <h2>{SMS_PERSONAL_STAFF_PROGRAM_NAME}</h2>
        <p>
          A separate program with its own consent, sent from{" "}
          {SMS_PERSONAL_STAFF_SENDER_PHONE}. How to opt in, the exact consent
          text, sample messages, and how to stop are on the{" "}
          <Link href={SMS_PERSONAL_STAFF_OPT_IN_PATH}>
            Personal Staff text messages page
          </Link>
          .
        </p>

        <p>
          Review the <Link href={SMS_TERMS_PATH}>SMS Terms and Conditions</Link>{" "}
          and <Link href={SMS_PRIVACY_PATH}>Privacy Policy</Link>.
        </p>
      </article>
    </div>
  );
}
