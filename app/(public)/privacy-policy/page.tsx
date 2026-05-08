import React from 'react';

const PrivacyPolicyPage = () => {
  return (
    <div className="container mx-auto max-w-3xl p-6 prose prose-neutral dark:prose-invert">
      <h1>Privacy Policy</h1>
      <p>
        <strong>Last updated:</strong> May 8, 2026
      </p>
      <p>
        AI Matrx (&quot;we&quot;, &quot;us&quot;) provides an AI-agent platform that
        you access through our website at{' '}
        <a href="https://www.aimatrx.com/" rel="external noopener" target="_blank">
          https://www.aimatrx.com
        </a>{' '}
        and through our Chrome extension &quot;Matrx Extend&quot; (the
        &quot;Extension&quot;). This Privacy Policy explains what information we
        collect, how we use it, where it goes, and how long we keep it. We do not
        sell your data, we do not run advertising, and we do not share your data
        with data brokers.
      </p>
      <p>
        Questions, deletion requests, or anything else: email{' '}
        <a href="mailto:support@aimatrx.com">support@aimatrx.com</a>.
      </p>

      <h2>1. Scope</h2>
      <p>This policy covers:</p>
      <ul>
        <li>The AI Matrx web application at aimatrx.com.</li>
        <li>
          The Matrx Extend Chrome extension, which runs an AI agent inside your
          browser and can read and act on the pages you choose to give it.
        </li>
        <li>
          The optional Matrx Local desktop companion, when you install it and
          connect it to the Extension.
        </li>
      </ul>
      <p>
        It does not cover third-party websites you visit or third-party services
        we link to. Each of those has its own policy.
      </p>

      <h2>2. Information we collect</h2>

      <h3>2.1 Account information</h3>
      <p>
        When you sign up we collect the information you provide: email address,
        name (if you set one), profile information, and a password (which is
        stored, hashed, by our authentication provider Supabase &mdash; we never
        see your plain-text password).
      </p>
      <p>
        The Extension stores your session locally on your device using
        Chrome&rsquo;s built-in extension storage (<code>chrome.storage.local</code>).
        Refresh tokens are encrypted at rest with AES-GCM before being stored.
      </p>

      <h3>2.2 Content and prompts you send to agents</h3>
      <p>
        When you use the Extension or the web app to chat with an agent, the
        following is transmitted to our agent backend so the agent can reason
        over it:
      </p>
      <ul>
        <li>The text of your messages and any files you attach.</li>
        <li>
          For Extension chats, page context derived from the active browser tab:
          URL, page title, language, viewport dimensions, the visible text or
          rendered HTML/markdown, the accessibility tree, headings, links, page
          metadata (Open Graph, Twitter, canonical, JSON-LD, schema.org blocks),
          any text you have selected, and an inventory of forms / images /
          videos / audio elements present.
        </li>
        <li>
          Prior messages in the same conversation, so the agent has continuity.
        </li>
        <li>
          Limited orchestration metadata: the current tab id, window id, open-tab
          count, your admin status, your selected permission mode, which optional
          permissions you have granted, and your extension version.
        </li>
        <li>
          Domain-scoped notes (&quot;guidance&quot;) you have authored for the
          current site, which the Extension auto-attaches when you are on that
          site.
        </li>
      </ul>
      <p>
        The agent backend then routes your request to a third-party large
        language model provider (see Section 3). Page content is processed solely
        to generate the agent&rsquo;s response.
      </p>

      <h3>2.3 Browser data the agent can access on your behalf</h3>
      <p>
        The Extension declares Chrome permissions that let the agent perform
        browser-level actions when you ask it to. The agent only reads or acts on
        these surfaces in response to your prompts; nothing is collected
        passively in the background.
      </p>
      <ul>
        <li>
          <strong>Tabs and tab groups</strong>: list, open, close, group, switch
          to, reload, and read URL/title of tabs in your current Chrome profile.
        </li>
        <li>
          <strong>Browsing history</strong>: search and list your Chrome history
          when an agent tool such as &quot;search history&quot; is invoked.
        </li>
        <li>
          <strong>Bookmarks</strong>: read your bookmark tree when invoked.
        </li>
        <li>
          <strong>Downloads</strong>: list, cancel, or initiate downloads when
          invoked.
        </li>
        <li>
          <strong>Recently closed tabs (sessions)</strong>: list and restore.
        </li>
        <li>
          <strong>Web navigation events</strong>: detect when a page finishes
          loading so the agent can read it.
        </li>
        <li>
          <strong>Clipboard write</strong>: write to your clipboard (for example,
          copying an audit receipt). The Extension does not read your clipboard
          unless you grant the optional <code>clipboardRead</code> permission.
        </li>
        <li>
          <strong>Notifications</strong>: shown when scheduled agent tasks become
          due.
        </li>
        <li>
          <strong>Native messaging</strong>: used only if you have installed the
          optional Matrx Local desktop companion, to bridge between the
          Extension and the desktop engine.
        </li>
        <li>
          <strong>Debugger (Chrome DevTools Protocol)</strong>: used by
          admin-only diagnostic tools (CDP). When attached, Chrome shows a
          visible &quot;is being debugged&quot; banner. CDP-derived data
          (console messages, network metadata, accessibility tree) is treated
          the same as any other page content described in Section 2.2.
        </li>
      </ul>

      <h3>2.4 Optional permissions you may grant at runtime</h3>
      <p>
        These are <em>not</em> requested at install time. The Extension asks for
        them only when you toggle them on in Settings &rarr; Advanced agent
        capabilities, and you can revoke them at any time from the same screen
        or from Chrome&rsquo;s extension settings.
      </p>
      <ul>
        <li>
          <strong>Cookies</strong>: read, set, or delete cookies on the current
          origin.
        </li>
        <li>
          <strong>Page capture</strong>: save the current page as an MHTML
          archive.
        </li>
        <li>
          <strong>Clipboard read</strong>: read clipboard contents on demand.
        </li>
        <li>
          <strong>Tab capture</strong>: record video of the active tab when you
          start a recording.
        </li>
        <li>
          <strong>All-sites access</strong> (<code>&lt;all_urls&gt;</code> host
          permission): allows page-reading content scripts to run on any
          website. Default is off; enable it if you want the agent to operate on
          arbitrary sites beyond the small list of always-allowed Matrx hosts.
        </li>
      </ul>

      <h3>2.5 Microphone audio (optional voice input)</h3>
      <p>
        If you press the microphone button in the Extension, your microphone
        captures audio locally. Audio chunks are sent to our backend at
        aimatrx.com, which proxies the audio to{' '}
        <a href="https://groq.com/" rel="external noopener" target="_blank">
          Groq
        </a>{' '}
        for speech-to-text transcription, and (when you ask an agent to speak)
        proxies generated text to{' '}
        <a href="https://cartesia.ai/" rel="external noopener" target="_blank">
          Cartesia
        </a>{' '}
        for text-to-speech synthesis. Audio is processed for the request only;
        we do not retain the raw audio.
      </p>

      <h3>2.6 Data stored locally on your device</h3>
      <p>
        The Extension keeps the following on your machine, in
        <code>chrome.storage.local</code>, and never uploads it unless you
        explicitly choose to:
      </p>
      <ul>
        <li>Settings, voice preferences, theme preference.</li>
        <li>
          Cached recent conversations (the authoritative copy lives on our
          server &mdash; see Section 3.2).
        </li>
        <li>
          &quot;Demos&quot; you record &mdash; sequences of your own browser
          actions you save for the agent to replay.
        </li>
        <li>
          Per-domain &quot;guidance&quot; notes, screenshots, and recordings
          you create.
        </li>
        <li>
          A local audit log of cryptographic run receipts: the Extension
          generates a device-bound Ed25519 keypair and signs a record of each
          tool call (call id, hashes of inputs and outputs, timestamps) so you
          can later verify what the agent did. The audit log is local-only;
          nothing is uploaded.
        </li>
        <li>
          A debug log ring buffer (last several hundred events). This is for
          your own troubleshooting and can be exported or cleared from the
          Debug tab.
        </li>
        <li>
          A short log of which tabs recently produced sound, used by the
          &quot;recently audible&quot; agent tool.
        </li>
      </ul>

      <h3>2.7 What we do not collect</h3>
      <ul>
        <li>No analytics, telemetry, or third-party trackers in the Extension.</li>
        <li>
          No advertising identifiers, fingerprinting, or precise location data.
        </li>
        <li>No selling of personal information; no data brokers.</li>
        <li>
          No reading of pages you have not directed the agent to operate on.
        </li>
      </ul>

      <h2>3. Where your data goes</h2>

      <h3>3.1 Sub-processors</h3>
      <p>
        We share data with the following providers strictly to operate the
        Service:
      </p>
      <ul>
        <li>
          <strong>Supabase</strong> &mdash; authentication, database storage,
          and realtime cross-device messaging. Hosts your account record,
          conversation history, and saved artifacts. (
          <a
            href="https://supabase.com/privacy"
            rel="external noopener"
            target="_blank"
          >
            Supabase privacy policy
          </a>
          )
        </li>
        <li>
          <strong>Vercel</strong> &mdash; hosting for our web application and
          API routes. Receives request metadata (IP address, user-agent) as part
          of normal HTTPS serving. (
          <a
            href="https://vercel.com/legal/privacy-policy"
            rel="external noopener"
            target="_blank"
          >
            Vercel privacy policy
          </a>
          )
        </li>
        <li>
          <strong>Groq</strong> &mdash; speech-to-text. Receives the audio you
          submit when you use voice input. (
          <a
            href="https://groq.com/privacy-policy/"
            rel="external noopener"
            target="_blank"
          >
            Groq privacy policy
          </a>
          )
        </li>
        <li>
          <strong>Cartesia</strong> &mdash; text-to-speech. Receives the text
          submitted for synthesis. (
          <a
            href="https://cartesia.ai/privacy"
            rel="external noopener"
            target="_blank"
          >
            Cartesia privacy policy
          </a>
          )
        </li>
        <li>
          <strong>Large language model providers</strong> &mdash; Anthropic,
          OpenAI, Google (Gemini), and other providers as configured per agent.
          When you send a message to an agent, the agent backend forwards your
          message and any included page context to whichever provider that
          agent is configured to use, so it can generate a response. Each
          provider&rsquo;s own privacy and data-retention policies apply to
          that processing. We do not train models on your content, and we use
          providers&rsquo; non-training, non-logging endpoints where they are
          offered.
        </li>
      </ul>

      <h3>3.2 What is stored on our servers</h3>
      <p>
        Your account record (email, profile fields), your conversation history,
        agents and prompts you have configured, and artifacts you save (notes,
        guidance items, recorded demos that you choose to sync) are stored on
        our infrastructure (Supabase) under your user id.
      </p>
      <p>
        These are <strong>retained until you delete them</strong>. You can
        delete individual conversations, artifacts, or your entire account at
        any time. Deleting your account removes your stored data within a
        commercially reasonable period, except where we are required to retain
        a record for legal, security, or fraud-prevention reasons.
      </p>

      <h3>3.3 Cross-device messaging</h3>
      <p>
        The Extension subscribes to a per-user Supabase Broadcast channel so
        that messages sent from your other devices or from the web app can be
        delivered to the Extension in real time. Only your authenticated
        sessions can publish or receive on your channel.
      </p>

      <h3>3.4 In-page integrations (WebMCP and externally connectable
        origins)</h3>
      <p>
        On a small allowlist of origins we control (aimatrx.com and our
        development hosts), the Extension exposes its tool catalog to in-page
        agents via the WebMCP API and accepts authenticated messages via
        Chrome&rsquo;s <code>externally_connectable</code> bridge. These
        bridges only operate on origins on the allowlist; arbitrary websites
        cannot use them to call the Extension.
      </p>

      <h2>4. How we use the information</h2>
      <ul>
        <li>To authenticate you and keep your session active.</li>
        <li>
          To run the AI agent you have invoked: deliver your prompts and the
          context you have authorized, return responses, and execute the
          browser tools you ask it to use.
        </li>
        <li>
          To maintain conversation history so the agent has memory across
          sessions.
        </li>
        <li>
          To support, debug, and improve the Service. We may review aggregated,
          de-identified usage signals (for example: error rates, tool failure
          counts) for reliability work; we do not use the contents of your
          conversations or page captures for product analytics.
        </li>
        <li>
          To comply with applicable law, prevent abuse, and protect the
          security of the Service.
        </li>
      </ul>
      <p>
        We do <strong>not</strong> use your personal data for behavioral
        advertising, and we do <strong>not</strong> sell or rent it to anyone.
      </p>

      <h2>5. Retention</h2>
      <ul>
        <li>
          <strong>Account record:</strong> kept until you delete your account.
        </li>
        <li>
          <strong>Conversations and saved artifacts:</strong> kept until you
          delete them or your account.
        </li>
        <li>
          <strong>Microphone audio (voice input):</strong> processed for the
          request and not retained by us. Provider retention is governed by
          Groq&rsquo;s and Cartesia&rsquo;s respective policies.
        </li>
        <li>
          <strong>Server logs:</strong> request-level operational logs (IP,
          timestamps, error codes) are retained for a limited period for
          security and debugging, then rotated out.
        </li>
        <li>
          <strong>Local extension data:</strong> stays on your device until you
          clear it, uninstall the Extension, or wipe Chrome&rsquo;s extension
          storage.
        </li>
      </ul>

      <h2>6. Your choices and rights</h2>
      <ul>
        <li>
          <strong>Access and export.</strong> Sign in to the web app to view
          your account record, conversations, and saved artifacts.
        </li>
        <li>
          <strong>Delete.</strong> Delete individual conversations or artifacts
          from inside the app. To delete your entire account, email{' '}
          <a href="mailto:support@aimatrx.com">support@aimatrx.com</a> from the
          address on file.
        </li>
        <li>
          <strong>Revoke optional permissions.</strong> In the Extension open
          Settings &rarr; Advanced agent capabilities, or open Chrome&rsquo;s
          extension settings page, to revoke any optional permission at any
          time.
        </li>
        <li>
          <strong>Uninstall.</strong> Uninstalling the Extension removes the
          Extension and its locally stored data from that device. Your
          server-side account record is unaffected; delete it separately if you
          want it gone.
        </li>
        <li>
          <strong>EU/UK/California rights.</strong> Depending on where you
          reside, you may have rights of access, rectification, erasure,
          portability, restriction, and objection (GDPR, UK GDPR, CCPA/CPRA).
          To exercise any of them email{' '}
          <a href="mailto:support@aimatrx.com">support@aimatrx.com</a> and we
          will respond within the timeframes required by the applicable law.
        </li>
      </ul>

      <h2>7. Security</h2>
      <p>
        We use HTTPS for all client-server traffic, store credentials with our
        authentication provider (Supabase) rather than rolling our own,
        encrypt refresh tokens at rest in extension storage, and gate
        privileged tool actions behind explicit user confirmation in the
        Extension. No method of transmission over the Internet or method of
        electronic storage is 100% secure; we cannot guarantee absolute
        security but we work to keep practices in line with the sensitivity of
        the data.
      </p>

      <h2>8. International data transfer</h2>
      <p>
        We are based in the United States. Data we process may be stored or
        processed in the United States or in any other country where our
        sub-processors operate. By using the Service you consent to such
        transfers. We rely on the standard contractual mechanisms our
        sub-processors offer for international transfer where applicable.
      </p>

      <h2>9. Children</h2>
      <p>
        The Service is not directed to children under 13 (or the equivalent
        minimum age in your jurisdiction). We do not knowingly collect personal
        data from children under that age. If you believe a child has provided
        us personal data, please contact{' '}
        <a href="mailto:support@aimatrx.com">support@aimatrx.com</a> and we
        will delete it.
      </p>

      <h2>10. Third-party links</h2>
      <p>
        The Service and the agents you run through it may navigate to or
        retrieve content from third-party websites. We are not responsible for
        the privacy practices of those sites, and this policy does not cover
        them.
      </p>

      <h2>11. Changes to this policy</h2>
      <p>
        We may update this policy from time to time. The &quot;Last
        updated&quot; date at the top reflects the most recent change. For
        material changes that affect how your data is handled, we will notify
        active users by email and/or through an in-product notice prior to the
        change taking effect.
      </p>

      <h2>12. Contact</h2>
      <p>
        AI Matrx
        <br />
        Email:{' '}
        <a href="mailto:support@aimatrx.com">support@aimatrx.com</a>
      </p>
    </div>
  );
};

export default PrivacyPolicyPage;
