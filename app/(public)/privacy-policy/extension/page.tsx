import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Matrx Extend — Chrome Extension Privacy Policy | AI Matrx",
  description:
    "Privacy policy for the Matrx Extend Chrome extension. Describes what user data the extension accesses, how it is used, and what we never do with it.",
};

export default function ExtensionPrivacyPolicyPage() {
  return (
    <div className="min-h-dvh bg-gradient-to-b from-background to-muted/20 py-12 px-6">
      <div className="max-w-3xl mx-auto">
        <div className="space-y-2 mb-10">
          <p className="text-sm text-muted-foreground">
            <Link href="/privacy-policy" className="hover:underline">
              ← Back to AI Matrx Privacy Policy
            </Link>
          </p>
          <h1 className="text-4xl font-bold tracking-tight">
            Matrx Extend — Chrome Extension Privacy Policy
          </h1>
          <p className="text-muted-foreground">Last updated: July 12, 2026</p>
        </div>

        <div className="prose prose-neutral dark:prose-invert max-w-none space-y-8">
          <section className="space-y-3">
            <h2 className="text-2xl font-semibold">Overview</h2>
            <p>
              Matrx Extend (the &ldquo;extension&rdquo;) is an opt-in AI
              assistant published by AI Matrx. It runs in your browser&rsquo;s
              side panel and helps you understand and act on the web page you
              are currently viewing — reading only the pages you explicitly
              choose to use it on.
            </p>
            <p>
              You can use the extension either with a Matrx account or{" "}
              <strong>as a guest, without creating an account</strong>. Guest use
              is described in its own section below.
            </p>
            <p>
              This policy describes only the extension&rsquo;s data practices.
              The broader AI Matrx website and platform are covered by the{" "}
              <Link href="/privacy-policy" className="underline">
                main AI Matrx Privacy Policy
              </Link>
              , which this document supplements.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-semibold">Single purpose</h2>
            <p>
              The single purpose of Matrx Extend is to be an{" "}
              <strong>
                AI assistant that helps you understand and act on the web page
                you are currently viewing
              </strong>
              , from the browser side panel.
            </p>
            <p>
              Everything the extension does serves that one purpose: answering
              questions about the current page, pulling information out of it,
              and — only when you ask — performing actions on it such as filling
              a form or navigating. It reads a page only when you engage it on
              that page, and actions that change a page ask for your
              confirmation first.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-semibold">What the extension accesses</h2>
            <p>The extension only accesses data when a user takes a deliberate action in the side panel, popup, or context menu. It does not run in the background scanning or collecting data from sites the user visits.</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Account information.</strong> Your Matrx user identity
                (email and the OAuth tokens issued by Supabase) is stored
                locally in <code>chrome.storage</code>, with the refresh token
                AES-GCM-encrypted at rest. These tokens are used to authenticate
                requests to your own Matrx account and are not shared with any
                third party.
              </li>
              <li>
                <strong>Page content you choose to capture.</strong> When you
                click an action such as &ldquo;Scrape this page&rdquo;,
                &ldquo;Run SEO audit&rdquo;, or &ldquo;Extract data&rdquo;, the
                extension reads the current tab&rsquo;s DOM (text, images,
                links, structured data) and sends a cleaned representation to
                your Matrx account. We do not capture pages you have not asked
                to capture.
              </li>
              <li>
                <strong>Chat input you provide.</strong> Messages you type into
                the Chat tab, plus any context you explicitly attach (for
                example, the current page title and URL), are sent to your
                Matrx backend so your selected agent can respond. Conversation
                history is stored under your account.
              </li>
              <li>
                <strong>Saved extraction patterns.</strong> Patterns you define
                in the Data tab — selectors, field names, the URL or domain
                they apply to — are saved to your Matrx account so they can be
                reapplied on future visits.
              </li>
              <li>
                <strong>Local preferences.</strong> Settings such as your
                preferred backend environment, UI state, and pairing tokens for
                an optional local desktop companion app are stored in{" "}
                <code>chrome.storage</code> on your machine.
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-semibold">What the extension does NOT do</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>We do not train AI models on your data.</strong>{" "}
                Content captured through the extension is stored in your
                account so you can use it. It is not used to train, fine-tune,
                or improve any model — ours or anyone else&rsquo;s.
              </li>
              <li>
                <strong>We do not sell or rent your data</strong> to data
                brokers, advertisers, or any third party.
              </li>
              <li>
                <strong>We do not use your data for advertising,</strong>{" "}
                including personalized advertising, profiling, or
                creditworthiness determinations.
              </li>
              <li>
                <strong>We do not run background scraping.</strong> The
                extension only reads page content in response to an explicit
                user action; there is no silent crawling, no automatic
                background submission of browsing activity, and no telemetry on
                pages you have not chosen to act on.
              </li>
              <li>
                <strong>We do not let humans browse your captured content</strong>{" "}
                except (a) with your affirmative consent, (b) as required for
                security or fraud investigation, or (c) to comply with
                applicable law.
              </li>
            </ul>
            <p className="text-sm text-muted-foreground">
              These commitments mirror Google&rsquo;s Chrome Web Store{" "}
              <em>Limited Use</em> requirements and apply to all data the
              extension handles.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-semibold">Where your data goes</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Supabase</strong> (operated by AI Matrx) — for
                authentication and direct, row-level-secured reads/writes of
                your saved captures, patterns, conversations, and audits.
              </li>
              <li>
                <strong>Matrx backend</strong> at{" "}
                <code>server.app.matrxserver.com</code> — for agent execution,
                streaming responses, and server-side processing.
              </li>
              <li>
                <strong>AI model providers.</strong> To generate a response, the
                Matrx backend forwards your message and any page context you
                included to the AI model provider that the agent you are using is
                configured to run on (for example Anthropic, OpenAI, or Google).
                This means the content of a page you engage the assistant on can
                be sent to that provider. Providers are used to generate your
                response; we do not authorize them to use your content to train
                their models.
              </li>
            </ul>
            <p>
              No other third parties receive your content. If you have paired the
              optional Matrx desktop companion app, the extension may communicate
              with it locally on your machine; that traffic does not leave your
              device.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-semibold">Why each Chrome permission is requested</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Host access (<code>&lt;all_urls&gt;</code>).</strong>{" "}
                Required because users decide which pages to scrape, audit, or
                extract structured data from — the extension cannot know in
                advance which sites a user will work with. Content scripts are
                only injected when the user explicitly clicks an action; the
                extension does not run on, observe, or transmit data from pages
                the user has not chosen to act on.
              </li>
              <li>
                <strong>activeTab + scripting.</strong> Used to inject the
                scrape collectors and the structured-data picker into the
                current tab when the user triggers them.
              </li>
              <li>
                <strong>storage.</strong> Persists your session tokens,
                preferences, and cached extraction patterns locally in{" "}
                <code>chrome.storage</code>.
              </li>
              <li>
                <strong>sidePanel.</strong> Renders the extension&rsquo;s
                primary UI as a Chrome side panel.
              </li>
              <li>
                <strong>identity.</strong> Powers the OAuth sign-in flow via{" "}
                <code>chrome.identity.launchWebAuthFlow</code> against the
                Matrx Supabase auth endpoint.
              </li>
              <li>
                <strong>offscreen.</strong> Holds long-running fetch/SSE
                streams (agent responses, scrape pipelines) so they are not cut
                off when Chrome suspends the service worker.
              </li>
              <li>
                <strong>nativeMessaging.</strong> Optional. When the user has
                installed the Matrx desktop companion app, the extension uses
                native messaging to talk to it locally for advanced
                file-system-aware workflows. The extension functions fully
                without it.
              </li>
              <li>
                <strong>alarms.</strong> Schedules a token refresh ahead of
                expiry so the user does not have to re-authenticate every
                hour.
              </li>
              <li>
                <strong>contextMenus.</strong> Adds right-click actions for
                sending the current page or selected text into the extension.
              </li>
              <li>
                <strong>clipboardWrite.</strong> Lets the user copy extracted
                content (Markdown, JSON, etc.) to the clipboard.
              </li>
              <li>
                <strong>downloads.</strong> Saves user-initiated exports of
                captured data to the user&rsquo;s local file system.
              </li>
              <li>
                <strong>webNavigation.</strong> Detects tab navigation events
                so the extension can recognize when the user has returned to a
                page that already has a saved extraction pattern.
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-semibold">
              Guest access (using the extension without an account)
            </h2>
            <p>
              You can open the side panel and use the assistant immediately, as a
              guest, without signing up. Guest use works the same way as
              signed-in use, and this policy applies to it in full.
            </p>
            <p>To make that work, when you use the extension as a guest:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>We create an anonymous account for you.</strong> Your
                installation generates a random identifier (it is not derived
                from your name, email, IP address, device hardware, or any other
                personal information). We send that identifier with your requests
                and use it to create and recognize an anonymous account on our
                servers, so your conversation can be processed and so we can
                apply fair-use limits.
              </li>
              <li>
                <strong>Your guest activity is stored under that anonymous
                account</strong> — the same conversations and content described
                elsewhere in this policy, handled the same way. It is not linked
                to a real-world identity, because we do not have one for you.
              </li>
              <li>
                <strong>If you later create an account or sign in,</strong> your
                guest activity is carried over and becomes part of that account.
              </li>
              <li>
                <strong>You can clear it.</strong> Uninstalling the extension, or
                clearing its local storage, discards the identifier on your
                device. To delete the anonymous account data held on our servers,
                email{" "}
                <a href="mailto:support@aimatrx.com" className="underline">
                  support@aimatrx.com
                </a>
                . Because guest accounts are anonymous, please send the request
                from the extension while the identifier is still installed, or
                include it, so we can find the right records.
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-semibold">Your controls</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Use it as a guest</strong> — you are not required to
                create an account to use the assistant.
              </li>
              <li>
                <strong>Sign out</strong> from the Settings tab clears local
                tokens immediately.
              </li>
              <li>
                <strong>Uninstall</strong> the extension to remove all
                extension-local storage.
              </li>
              <li>
                <strong>Delete saved data</strong> (captures, patterns,
                conversations, SEO audits) at any time from your Matrx
                account, or by emailing us.
              </li>
              <li>
                <strong>Account deletion</strong> requests — for a full account
                or for an anonymous guest account — can be sent to{" "}
                <a
                  href="mailto:support@aimatrx.com"
                  className="underline"
                >
                  support@aimatrx.com
                </a>
                .
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-semibold">Children</h2>
            <p>
              Matrx Extend is not directed to children under 13 and we do not
              knowingly collect data from them.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-semibold">Changes</h2>
            <p>
              We will update the &ldquo;Last updated&rdquo; date and the body of
              this page if our extension data practices change. Material
              changes will also be surfaced in the extension itself.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-2xl font-semibold">Contact</h2>
            <p>
              Questions about this policy or a request related to your data:{" "}
              <a
                href="mailto:support@aimatrx.com"
                className="underline"
              >
                support@aimatrx.com
              </a>
              {" "}or via our{" "}
              <Link href="/contact" className="underline">
                contact form
              </Link>
              .
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
