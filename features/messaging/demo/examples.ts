import {
  asMessageId,
  asConversationId,
  asUserId,
  asOrganizationId,
  type Message,
} from "@ai-matrx/messaging";

export interface MessageExample {
  title: string;
  category: string;
  message: Message;
  note?: string;
}
const id = "00000000-0000-4000-8000-000000000001";
function example(
  title: string,
  category: string,
  content: string,
  changes: Partial<Message> = {},
  note?: string,
): MessageExample {
  return {
    title,
    category,
    note,
    message: {
      id: asMessageId(`demo-${title}`),
      conversationId: asConversationId(id),
      senderId: asUserId(id),
      organizationId: asOrganizationId(id),
      content,
      kind: "text",
      deliveryState: "delivered",
      replyToId: null,
      clientMessageId: null,
      createdAt: "2026-09-30T17:30:00Z",
      editedAt: null,
      deletedAt: null,
      deletedForEveryone: false,
      action: null,
      attachments: [],
      references: [],
      metadata: {},
      ...changes,
    },
  };
}
export const MESSAGE_EXAMPLES: MessageExample[] = [
  example("Short message", "Text", "What do you think?"),
  example(
    "Multiline message",
    "Text",
    "Hi Maya,\nThe new design is ready.\nCan you take a look this afternoon?",
  ),
  example(
    "Long conversation",
    "Text",
    "The best part of this design is that the conversation stays in focus. Search, names and tools stay compact, while the message has room to breathe.\n\nWe can share a draft, discuss the details and turn the next step into an action without leaving the thread.",
  ),
  example(
    "Emphasis and inline code",
    "Markdown",
    "**Ready for review.** The *draft* includes ~~old copy~~ updated copy and the `message_id` reference.",
  ),
  example(
    "Headings",
    "Markdown",
    "# Launch review\n## Design\n### Next steps\nThe smallest useful heading still needs a clear hierarchy.",
  ),
  example(
    "Lists",
    "Markdown",
    "- Review the layout\n- Check the details\n  - Search and names\n  - Composer and actions\n\n1. Gather feedback\n2. Make the final changes",
  ),
  example(
    "Checklist",
    "Markdown",
    "- [x] Draft shared\n- [x] Review scheduled\n- [ ] Final approval",
  ),
  example(
    "Quote",
    "Markdown",
    "> Keep the conversation in focus.\n\nAgreed. This is the direction.",
  ),
  example(
    "Table",
    "Markdown",
    "| Area | Owner | Status |\n| --- | --- | --- |\n| Design | Maya | Ready |\n| Content | Alex | In review |\n| Engineering | Sam | Complete |",
  ),
  example(
    "Code block",
    "Markdown",
    '```typescript\nconst message = {\n  content: "Ready to review",\n  deliveryState: "delivered",\n};\n```',
  ),
  example(
    "Links",
    "Markdown",
    "Here is the [message showcase](/messages-showcase) and an automatic link: https://aimatrx.com",
  ),
  example(
    "Long unbroken text",
    "Markdown",
    "Reference: " + "abcdefghij".repeat(30),
  ),
  example(
    "Image in Markdown",
    "Media",
    "![Design sample](/messages-demo-landscape.svg)",
  ),
  ...(["image", "video", "audio", "file"] as const).map((kind) =>
    example(
      `${kind[0].toUpperCase()}${kind.slice(1)} attachment`,
      "Media",
      `${kind === "image" || kind === "audio" ? "An" : "A"} ${kind} was shared.`,
      {
        kind,
        attachments: [
          {
            fileId: id,
            fileName: `Review.${kind === "image" ? "png" : kind === "video" ? "mp4" : kind === "audio" ? "mp3" : "pdf"}`,
            mimeType: kind === "file" ? "application/pdf" : `${kind}/*`,
            sizeBytes: 2400000,
            width: kind === "image" ? 1200 : null,
            height: kind === "image" ? 800 : null,
          },
        ],
      },
      "Sample attachment — demo media.",
    ),
  ),
  example("Platform reference", "Rich content", "Here is the project brief.", {
    references: [
      {
        entityType: "note",
        entityId: id,
        label: "Project brief",
        href: "/notes",
      },
    ],
  }),
  example("System message", "States", "Maya joined the conversation.", {
    kind: "system",
  }),
  ...(["sending", "sent", "delivered", "read", "failed"] as const).map(
    (deliveryState) =>
      example(
        `Delivery: ${deliveryState}`,
        "States",
        "The draft is ready for review.",
        { deliveryState },
      ),
  ),
  example("Edited message", "States", "Let's meet at 2:30 instead.", {
    editedAt: "2026-09-30T17:35:00Z",
  }),
  example("Deleted message", "States", "", {
    deletedAt: "2026-09-30T17:35:00Z",
    deletedForEveryone: true,
  }),
  example(
    "Reply",
    "States",
    "Yes, the second version.",
    { replyToId: asMessageId(id) },
    "Quoted replies preserve the original message context.",
  ),
  ...(
    [
      {
        kind: "meet.meeting-invite",
        title: "Meeting invitation",
        content: "Join the design review.",
        payload: {
          meeting_id: id,
          slug: "design-review-demo",
          title: "Design review",
          scheduled_for: null,
          link: "/meet/design-review-demo",
        },
      },
      {
        kind: "meet.call-invite",
        title: "Video call invitation",
        content: "Maya started a video call.",
        payload: {
          invite_id: id,
          room_name: "demo",
          mode: "video",
          caller_name: "Maya",
          expires_at: "2099-01-01T00:00:00Z",
        },
      },
      {
        kind: "meet.call-invite",
        title: "Expired call",
        content: "Missed call from Maya.",
        payload: {
          invite_id: id,
          room_name: "demo",
          mode: "audio",
          caller_name: "Maya",
          expires_at: "2020-01-01T00:00:00Z",
        },
      },
      {
        kind: "open_link",
        title: "Open a page",
        content: "The report is ready.",
        payload: { href: "/reports", label: "Open report" },
      },
      {
        kind: "open_link",
        title: "Open Review",
        content: "The review is ready.",
        payload: {
          href: "/administration/users/agent-review",
          label: "Open Review",
        },
      },
      {
        kind: "access_request",
        title: "Resource action request",
        content: "Alex requested deletion of the draft.",
        payload: {
          request_id: id,
          resource_type: "note",
          resource_id: id,
          request_kind: "resource_action",
          action_key: "delete",
          href: "/notes",
          entity_title: "Launch brief",
        },
      },
      {
        kind: "task_reminder",
        title: "Task reminder",
        content: "Review the launch brief today.",
        payload: { task_id: id, title: "Review launch brief" },
      },
      {
        kind: "resource_shared",
        title: "Shared resource",
        content: "Maya shared a note with you.",
        payload: {
          resource_type: "note",
          resource_id: id,
          resource_title: "Launch brief",
          resource_label: "Note",
          sharer_name: "Maya",
        },
      },
      {
        kind: "access_request",
        title: "Access request",
        content: "Alex would like to edit the launch brief.",
        payload: {
          request_id: id,
          resource_type: "note",
          resource_id: id,
          requested_level: "editor",
          entity_title: "Launch brief",
          entity_label: "Note",
        },
      },
      {
        kind: "agent_drift",
        title: "Agent update",
        content: "The research assistant has an update to review.",
        payload: { agent_id: id, agent_name: "Research assistant" },
      },
      {
        kind: "setting_access_request",
        title: "Setting request",
        content: "Alex requested a settings change.",
        payload: {
          request_id: id,
          href: "/user-settings",
          action_key: "request_access.manual",
        },
      },
    ] satisfies {
      kind: string;
      title: string;
      content: string;
      payload: NonNullable<Message["action"]>["payload"];
    }[]
  ).map(({ kind, title, content, payload }) =>
    example(title, "Actions", content, {
      kind: "action",
      action: { kind, version: 1, payload },
    }),
  ),
];
