import type { WAMessage } from "../types";

const NOW = new Date("2026-05-04T21:30:00");
function iso(offsetMs: number): string {
  return new Date(NOW.getTime() + offsetMs).toISOString();
}
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const KELVIN_LONG_LIST = `Hey, I appreciate the honest feedback. Looking back, there were several decisions I should have flagged before making them. I had noted them down before I took a brief nap:

1. The studio files were copied, not moved — the original \`features/image-studio/\` folder still exists with duplicate code. When does that get cleaned up, and who approves it?
2. Private images (screenshots, chat uploads) will show a blank state in the image viewer because there's no signed URL fallback. Should that have been in scope for this PR?
3. I simplified the Gallery Window panel without getting approval — if users relied on anything in the old version, that's an unapproved regression.
4. Images uploaded through the Manager default to not published to the web, meaning they won't get CDN URLs. Not sure if that's the right call.
5. The Search page lets you click Unsplash results, but nothing happens — I assumed it was okay to leave as a no-op, but that might be wrong.
6. Lastly, the planning docs were never committed to the repo — not sure if they're meant to live there.

I should have raised all of these before making the calls myself. Can we find time to go through them?`;

const ARMANI_RESPONSE = `I need to see what you're talking about with the changes. If you made 100 huge improvements and a few missteps, that's easy to fix. But if we lost features and didn't make a big improvement, then that doesn't work.

Some of what you're saying really concerns me though because you're talking about clicking on images that didn't do anything and I'm not sure if you have fully done everything.

I don't know until I see it.

What I need is to know is this:

1. Is it ready for me to look at?
2. Should I do it on my own or do you want to show me?`;

const KELVIN_THREAD: WAMessage[] = [
  {
    id: "sys-e2e",
    conversationId: "kelvin",
    type: "system",
    content:
      "Messages and calls are end-to-end encrypted. No one outside of this chat, not even WhatsApp, can read or listen to them.",
    authorId: "system",
    isOwn: false,
    createdAt: iso(-3 * DAY),
    status: "read",
    systemKind: "encryption",
  },
  {
    id: "k-1",
    conversationId: "kelvin",
    type: "text",
    content: "look at and interact with directly.",
    authorId: "kelvin",
    isOwn: false,
    createdAt: iso(-5 * HOUR - 18 * MIN),
    status: "read",
  },
  {
    id: "a-1",
    conversationId: "kelvin",
    type: "text",
    content: `I'm just very surprised that you haven't had any questions at all. Almost always, that's a really bad sign. I have to be honest with you. I want you to be successful with this and I can guarantee you that if I was working on this project and reporting to you, we would have had 10 or more calls and meetings and questions by now.`,
    authorId: "me",
    isOwn: true,
    createdAt: iso(-4 * HOUR - 31 * MIN),
    status: "read",
  },
  {
    id: "k-2",
    conversationId: "kelvin",
    type: "text",
    content: KELVIN_LONG_LIST,
    authorId: "kelvin",
    isOwn: false,
    createdAt: iso(-17 * MIN),
    status: "read",
  },
  {
    id: "a-2",
    conversationId: "kelvin",
    type: "text",
    content: ARMANI_RESPONSE,
    authorId: "me",
    isOwn: true,
    createdAt: iso(-3 * MIN),
    status: "delivered",
  },
];

const SELF_THREAD: WAMessage[] = [
  {
    id: "self-1",
    conversationId: "self",
    type: "text",
    content: "https://github.com/anthropics/claude-code",
    authorId: "me",
    isOwn: true,
    createdAt: iso(-DAY),
    status: "read",
  },
];

const STEVE_THREAD: WAMessage[] = [
  {
    id: "sys-steve",
    conversationId: "steve",
    type: "system",
    content:
      "Messages and calls are end-to-end encrypted. No one outside of this chat, not even WhatsApp, can read or listen to them.",
    authorId: "system",
    isOwn: false,
    createdAt: iso(-30 * DAY),
    status: "read",
    systemKind: "encryption",
  },
  {
    id: "s-1",
    conversationId: "steve",
    type: "text",
    content: "Morning! Are we still on for the design review at 10?",
    authorId: "me",
    isOwn: true,
    createdAt: iso(-DAY - 2 * HOUR),
    status: "read",
  },
  {
    id: "s-2",
    conversationId: "steve",
    type: "text",
    content: "Yes — I'll bring the new wireframes",
    authorId: "steve",
    isOwn: false,
    createdAt: iso(-DAY - HOUR - 30 * MIN),
    status: "read",
  },
  {
    id: "s-3",
    conversationId: "steve",
    type: "audio",
    content: "Voice message",
    authorId: "steve",
    isOwn: false,
    createdAt: iso(-13 * HOUR),
    status: "read",
    media: { durationSec: 47 },
  },
  {
    id: "s-4",
    conversationId: "steve",
    type: "text",
    content: "okay, I am starting on the new dashboard layout this morning",
    authorId: "steve",
    isOwn: false,
    createdAt: iso(-12 * HOUR - 16 * MIN),
    status: "delivered",
  },
];

const AAMIR_THREAD: WAMessage[] = [
  {
    id: "aa-1",
    conversationId: "aamir",
    type: "text",
    content: "Did the Search Console export come through?",
    authorId: "aamir",
    isOwn: false,
    createdAt: iso(-2 * DAY),
    status: "read",
  },
  {
    id: "aa-2",
    conversationId: "aamir",
    type: "image",
    content: "Quarterly impressions chart",
    authorId: "me",
    isOwn: true,
    createdAt: iso(-DAY - 3 * HOUR),
    status: "read",
    media: { thumbnailUrl: "/matrx/sample-chart.png", width: 800, height: 420 },
  },
  {
    id: "aa-3",
    conversationId: "aamir",
    type: "text",
    content: "Send me a copy of the SEO audit when you get a chance",
    authorId: "aamir",
    isOwn: false,
    createdAt: iso(-13 * HOUR - 15 * MIN),
    status: "delivered",
  },
];

const MELISA_THREAD: WAMessage[] = [
  {
    id: "m-1",
    conversationId: "melisa",
    type: "text",
    content: "Good morning Doctor",
    authorId: "melisa",
    isOwn: false,
    createdAt: iso(-DAY - 2 * HOUR),
    status: "read",
  },
  {
    id: "m-2",
    conversationId: "melisa",
    type: "file",
    content: "patient-schedule-may.pdf",
    authorId: "melisa",
    isOwn: false,
    createdAt: iso(-13 * HOUR - 30 * MIN),
    status: "read",
    media: {
      fileName: "patient-schedule-may.pdf",
      fileSize: 487_312,
      mimeType: "application/pdf",
    },
  },
  {
    id: "m-3",
    conversationId: "melisa",
    type: "text",
    content: "Patients' daily schedule is attached for review",
    authorId: "melisa",
    isOwn: false,
    createdAt: iso(-13 * HOUR - 24 * MIN),
    status: "delivered",
  },
];

const KAMAL_THREAD: WAMessage[] = [
  {
    id: "kg-1",
    conversationId: "kamal",
    type: "text",
    content: "Did you confirm the wire transfer?",
    authorId: "me",
    isOwn: true,
    createdAt: iso(-3 * DAY - HOUR),
    status: "read",
  },
  {
    id: "kg-2",
    conversationId: "kamal",
    type: "text",
    content: "Ok",
    authorId: "k1",
    isOwn: false,
    createdAt: iso(-3 * DAY),
    status: "read",
  },
];

const MOCK_THREADS: Record<string, WAMessage[]> = {
  self: SELF_THREAD,
  kelvin: KELVIN_THREAD,
  steve: STEVE_THREAD,
  aamir: AAMIR_THREAD,
  melisa: MELISA_THREAD,
  kamal: KAMAL_THREAD,
  "amir-invoices": [
    {
      id: "ai-1",
      conversationId: "amir-invoices",
      type: "text",
      content: "This is approved — proceed with the wire transfer",
      authorId: "me",
      isOwn: true,
      createdAt: iso(-4 * DAY),
      status: "read",
    },
  ],
  "cic-seo": [
    {
      id: "cs-1",
      conversationId: "cic-seo",
      type: "text",
      content: "rolling out the new keyword set tomorrow",
      authorId: "c1",
      isOwn: false,
      createdAt: iso(-7 * DAY),
      status: "read",
    },
  ],
};

export function getMockMessages(conversationId: string): WAMessage[] {
  return MOCK_THREADS[conversationId] ?? [];
}
