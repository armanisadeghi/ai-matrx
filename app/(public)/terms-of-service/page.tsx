import Link from "next/link";
import { createRouteMetadata } from "@/utils/route-metadata";
import { siteConfig } from "@/config/extras/site";

export const metadata = createRouteMetadata("/terms-of-service", {
  title: "Terms of Service",
  description: "The terms that govern use of AI Matrx products and services.",
  canonicalPath: "/terms-of-service",
});

export default function TermsOfServicePage() {
  return (
    <div className="h-full overflow-y-auto">
      <article className="container mx-auto max-w-3xl p-6 prose prose-neutral dark:prose-invert">
        <h1>Terms of Service</h1>
        <p>
          <strong>Last updated:</strong> August 11, 2026
        </p>
        <p>
          AI Matrx is a technology product owned and operated by {siteConfig.legalOperatorName}.
          These Terms of Service govern your use of AI Matrx websites, applications, agents,
          and related services (the &quot;Services&quot;). By creating an account or using the
          Services, you agree to these terms with {siteConfig.legalOperatorName}. If you use
          the Services for an organization, you represent that you are authorized to accept
          these terms for it.
        </p>

        <h2>1. The Services</h2>
        <p>
          AI Matrx provides tools for creating and running AI-assisted workflows, working
          with user-selected content, and taking actions that users request. Features may
          change as the Services improve. We may suspend or discontinue a feature, and we
          will provide notice when reasonably practical if a material change affects you.
        </p>

        <h2>2. Your account</h2>
        <p>
          You must provide accurate account information, keep your credentials secure, and
          promptly notify us if you believe your account has been compromised. You are
          responsible for activity performed through your account and for ensuring that your
          use complies with applicable law and any obligations to your organization.
        </p>

        <h2>3. Your content and connected services</h2>
        <p>
          You retain ownership of content you submit, select, or connect to the Services.
          You grant AI Matrx only the limited rights needed to host, process, transmit, and
          display that content to provide the actions and results you request.
        </p>
        <p>
          If you connect a third-party service, including Google Workspace, you authorize AI
          Matrx to access that service only within the permissions you approve and only to
          provide the feature you choose. You are responsible for having the necessary rights
          to the content and accounts you connect. You can disconnect Google access from AI
          Matrx or your Google Account settings. Our <Link href="/privacy-policy">Privacy Policy</Link>{" "}
          explains how we handle connected data.
        </p>

        <h2>4. Acceptable use</h2>
        <p>You may not use the Services to:</p>
        <ul>
          <li>Violate law, another person&apos;s rights, or a binding contractual obligation.</li>
          <li>Access accounts, systems, or data without authorization.</li>
          <li>Distribute malware, evade security controls, or disrupt the Services.</li>
          <li>Misrepresent AI-generated material as human-created when disclosure is required.</li>
          <li>Use the Services to facilitate fraud, abuse, harassment, or unlawful discrimination.</li>
        </ul>
        <p>
          We may investigate suspected abuse and restrict access when reasonably necessary to
          protect users, the Services, or comply with law.
        </p>

        <h2>5. AI-generated results and user-directed actions</h2>
        <p>
          AI systems can produce incomplete, inaccurate, or unexpected results. You must
          review outputs and proposed actions before relying on them, especially for legal,
          medical, financial, employment, or other high-impact decisions. When a feature
          presents an action for confirmation, you are responsible for checking its details
          before approving it.
        </p>

        <h2>6. Third-party services</h2>
        <p>
          The Services may interoperate with third-party products. Their terms and privacy
          policies govern your use of those products, and AI Matrx is not responsible for
          third-party services outside our control.
        </p>

        <h2>7. Fees</h2>
        <p>
          If you purchase a paid plan, you agree to the price and billing terms shown at
          purchase. Except where law requires otherwise, charges for a completed billing
          period are non-refundable. We will provide advance notice of material price changes
          that affect an active subscription.
        </p>

        <h2>8. Intellectual property</h2>
        <p>
          AI Matrx and its licensors retain all rights in the Services, including software,
          branding, and documentation. These terms do not transfer ownership of the Services
          or your content. Feedback you voluntarily provide may be used to improve the
          Services without obligation to you.
        </p>

        <h2>9. Suspension and termination</h2>
        <p>
          You may stop using the Services at any time. We may suspend or terminate access for
          a material breach of these terms, unlawful activity, security risk, or nonpayment.
          Where appropriate, we will provide notice and an opportunity to cure. Provisions
          that by their nature should survive termination will remain in effect.
        </p>

        <h2>10. Disclaimers</h2>
        <p>
          To the extent permitted by law, the Services are provided &quot;as is&quot; and
          &quot;as available.&quot; AI Matrx disclaims implied warranties of merchantability,
          fitness for a particular purpose, and non-infringement. We do not warrant that the
          Services will be uninterrupted or that every result will be accurate.
        </p>

        <h2>11. Limitation of liability</h2>
        <p>
          To the extent permitted by law, AI Matrx will not be liable for indirect,
          incidental, special, consequential, or punitive damages, or for lost profits,
          revenue, data, or goodwill. AI Matrx&apos;s total liability arising from the Services
          will not exceed the greater of $100 or the amount you paid AI Matrx for the Services
          during the 12 months before the event giving rise to the claim. These limits do not
          apply where applicable law prohibits them.
        </p>

        <h2>12. Governing law</h2>
        <p>
          California law governs these terms, without regard to conflict-of-law rules. Courts
          located in California will have exclusive jurisdiction, except where applicable law
          gives you the right to bring a claim elsewhere.
        </p>

        <h2>13. Changes to these terms</h2>
        <p>
          We may update these terms to reflect changes to the Services, law, or our business.
          The date above identifies the current version. If a change materially affects your
          rights, we will provide reasonable notice before it takes effect.
        </p>

        <h2>14. Contact</h2>
        <p>
          {siteConfig.legalOperatorName}<br />
          AI Matrx product<br />
          Questions about these terms can be sent to{" "}
          <a href="mailto:info@aimatrx.com">info@aimatrx.com</a>.
        </p>
        <p>
          The separate <Link href="/terms-and-conditions">SMS Terms and Conditions</Link>{" "}
          apply if you enroll in the AI Matrx text-message program.
        </p>
      </article>
    </div>
  );
}
