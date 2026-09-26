import Link from "next/link";
import { createRouteMetadata } from "@/utils/route-metadata";
import { siteConfig } from "@/config/extras/site";
import {
  SMS_PERSONAL_STAFF_CONSENT_DISCLOSURE,
  SMS_PERSONAL_STAFF_OPT_IN_PATH,
  SMS_PERSONAL_STAFF_PROGRAM_NAME,
  SMS_PERSONAL_STAFF_SENDER_PHONE,
  SMS_PRIVACY_PATH,
  SMS_SETTINGS_PATH,
  SMS_SUPPORT_EMAIL,
  SMS_TERMS_PATH,
} from "@/features/sms/compliance";

/**
 * The public opt-in page for ONE SMS program: AI Matrx Personal Staff. Its 10DLC
 * campaign points reviewers here, so it carries exactly this program's consent
 * and nothing else — carriers reject consent bundled with another program's
 * (Twilio 30913, 2026-09-26). The account/workplace notification program lives
 * on /sms.
 */
export const metadata = createRouteMetadata(SMS_PERSONAL_STAFF_OPT_IN_PATH, {
  title: "Personal Staff Text Messages",
  description:
    "How AI Matrx account holders opt in to text messages from their AI Matrx Personal Staff, and how to stop them.",
  canonicalPath: SMS_PERSONAL_STAFF_OPT_IN_PATH,
});

const SAMPLE_MESSAGES = [
  "AI Matrx: On it. I'm pulling the September invoice totals you asked for and will text you the summary in a few minutes. Reply STOP to opt out.",
  "AI Matrx: Done. The report you requested is ready. View it at https://www.aimatrx.com. Reply STOP to opt out.",
  "AI Matrx: Quick check before I send the revised quote you asked me to prepare: reply YES to send or NO to hold. Reply STOP to opt out.",
  "AI Matrx: To finish the step you requested, sign in securely at https://www.aimatrx.com/q/[code] (link expires in 10 minutes). Reply STOP to opt out.",
];

function formatPhone(e164: string): string {
  const digits = e164.replace(/\D/g, "").slice(-10);
  return `+1 (${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export default function PersonalStaffSmsPage() {
  const signInHref = `/login?redirectTo=${encodeURIComponent(SMS_SETTINGS_PATH)}`;

  return (
    <div className="bg-background">
      <article className="prose prose-neutral mx-auto max-w-3xl px-4 py-8 dark:prose-invert sm:px-6 sm:py-12">
        <h1>{SMS_PERSONAL_STAFF_PROGRAM_NAME} text messages</h1>
        <p>
          AI Matrx Personal Staff are AI assistants an AI Matrx account holder
          directs by text message. After opting in, the account holder texts
          their Personal Staff and receives replies to their own requests: a
          confirmation that a request was received, the result of the task they
          asked for, a question when their approval is needed, and a secure link
          when a step must be finished in the AI Matrx app.
        </p>
        <p>
          Messages go only to the account holder&apos;s own verified mobile
          number, and only about requests they made. <strong>No marketing
          messages are sent.</strong>
        </p>
        <p>
          <strong>Operator:</strong> AI Matrx is owned and operated by{" "}
          {siteConfig.legalOperatorName} (
          <a href={siteConfig.legalOperatorUrl} rel="external noopener" target="_blank">
            {siteConfig.legalOperatorUrl}
          </a>
          ).
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
          <li>Enter your own mobile number.</li>
          <li>
            Check the box labeled <strong>{SMS_PERSONAL_STAFF_PROGRAM_NAME}</strong>.
            This box is unchecked by default, it is separate from every other
            consent, and it covers this program only. Checking it is optional
            and not required to create or use an AI Matrx account.
          </li>
          <li>
            Select <strong>Send verification code</strong> and enter the
            six-digit code we text you. Personal Staff messages start only
            after the code is confirmed.
          </li>
        </ol>

        <h2>The consent you give</h2>
        <p>The box reads, in full:</p>
        <blockquote>{SMS_PERSONAL_STAFF_CONSENT_DISCLOSURE}</blockquote>

        <h2>Program details</h2>
        <ul>
          <li>
            <strong>Program:</strong> {SMS_PERSONAL_STAFF_PROGRAM_NAME}
          </li>
          <li>
            <strong>Sent from:</strong> {formatPhone(SMS_PERSONAL_STAFF_SENDER_PHONE)}
          </li>
          <li>
            <strong>Message frequency:</strong> varies with the requests you send.
          </li>
          <li>
            <strong>Cost:</strong> message and data rates may apply.
          </li>
          <li>
            <strong>Stop:</strong> reply <strong>STOP</strong> at any time, or
            turn texts off in User Settings. You will get one confirmation and no
            further messages.
          </li>
          <li>
            <strong>Help:</strong> reply <strong>HELP</strong>, or email{" "}
            <a href={`mailto:${SMS_SUPPORT_EMAIL}`}>{SMS_SUPPORT_EMAIL}</a>.
          </li>
          <li>
            Carriers are not liable for delayed or undelivered messages.
          </li>
        </ul>

        <h2>Sample messages</h2>
        <ul>
          {SAMPLE_MESSAGES.map((sample) => (
            <li key={sample}>
              <code className="whitespace-normal break-words">{sample}</code>
            </li>
          ))}
        </ul>

        <p>
          Read the <Link href={SMS_TERMS_PATH}>Terms and Conditions</Link> and
          the <Link href={SMS_PRIVACY_PATH}>Privacy Policy</Link>. Mobile
          numbers and opt-in consent are never sold or shared with third
          parties for their marketing.
        </p>
      </article>
    </div>
  );
}
