import Link from "next/link";
import { createRouteMetadata } from "@/utils/route-metadata";
import { siteConfig } from "@/config/extras/site";
import {
  SMS_OPT_IN_PATH,
  SMS_PRIVACY_PATH,
  SMS_PROGRAM_NAME,
  SMS_SENDER_PHONE,
  SMS_SUPPORT_EMAIL,
} from "@/features/sms/compliance";

export const metadata = createRouteMetadata("/terms-and-conditions", {
  title: "SMS Terms and Conditions",
  description: "Terms and conditions for the AI Matrx SMS notification program.",
  canonicalPath: "/terms-and-conditions",
});

export default function TermsAndConditionsPage() {
  return (
    <div className="h-full overflow-y-auto">
      <article className="container mx-auto max-w-3xl p-6 prose prose-neutral dark:prose-invert">
        <h1>SMS Terms and Conditions</h1>
        <p>
          <strong>Last updated:</strong> August 11, 2026
        </p>
        <p>
          These terms govern {SMS_PROGRAM_NAME}. AI Matrx is a technology service owned and
          operated by {siteConfig.legalOperatorName}. By affirmatively opting in and verifying
          your mobile number, you agree to receive recurring automated transactional and
          service-related text messages from {siteConfig.legalOperatorName} under the AI Matrx
          product name.
        </p>

        <h2>Program description</h2>
        <p>
          Depending on the preferences and product features you enable, messages may include
          task reminders, job-completion alerts, direct-message notifications, system alerts,
          verification messages, and requested AI-agent responses. Messages may be sent from{" "}
          {SMS_SENDER_PHONE} or another number registered for this AI Matrx program.
        </p>

        <h2>Consent and eligibility</h2>
        <p>
          SMS participation is optional and is not a condition of purchase, account creation,
          or use of AI Matrx. You must control the mobile number you enroll. The full opt-in
          process and disclosure are available on the <Link href={SMS_OPT_IN_PATH}>SMS program page</Link>.
        </p>

        <h2>Message frequency and charges</h2>
        <p>
          Message frequency varies based on your enabled notifications and interactions with
          AI Matrx. Message and data rates may apply according to your wireless plan.
        </p>

        <h2>Opt out and help</h2>
        <p>
          Reply <strong>STOP</strong> to any AI Matrx message to unsubscribe. After opting out,
          you may receive one final confirmation message. Reply <strong>HELP</strong> for help,
          or email <a href={`mailto:${SMS_SUPPORT_EMAIL}`}>{SMS_SUPPORT_EMAIL}</a>. You can also
          disable SMS notifications in User Settings.
        </p>

        <h2>Delivery</h2>
        <p>
          Wireless carriers do not guarantee message delivery and are not liable for delayed or
          undelivered messages. AI Matrx may suspend messaging to protect users, comply with law,
          or respond to carrier requirements.
        </p>

        <h2>Privacy</h2>
        <p>
          Our <Link href={SMS_PRIVACY_PATH}>Privacy Policy</Link> explains how mobile numbers,
          messaging consent, and SMS content are handled. Mobile information and SMS opt-in
          consent are not sold or shared with third parties or affiliates for marketing or
          promotional purposes.
        </p>

        <h2>Changes</h2>
        <p>
          We may update these terms as the program or applicable requirements change. The date
          above identifies the current version. Material changes will be communicated as required.
        </p>

        <h2>Contact</h2>
        <p>
          {siteConfig.legalOperatorName}<br />
          AI Matrx product<br />
          Website:{" "}
          <a href={siteConfig.legalOperatorUrl} rel="external noopener" target="_blank">
            {siteConfig.legalOperatorUrl}
          </a><br />
          Email: <a href={`mailto:${SMS_SUPPORT_EMAIL}`}>{SMS_SUPPORT_EMAIL}</a>
        </p>
      </article>
    </div>
  );
}
