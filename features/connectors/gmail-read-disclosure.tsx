"use client";

import Link from "next/link";

import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";

import type { ConsentRequest } from "./consent-plan";

/**
 * Gmail reading is a restricted Google scope with two distinct product uses.
 * Keep the disclosure at the last in-app boundary before Google consent so a
 * dismissal can never be mistaken for permission.
 */
export async function confirmGmailReadDisclosure(
  request: ConsentRequest,
): Promise<boolean> {
  if (!request.capabilityKeys.includes("gmail_read")) return true;

  return confirm({
    title: "Allow AI Matrx to read Gmail?",
    description: (
      <div className="space-y-3 text-left">
        <p>
          AI Matrx will receive read-only access to messages in the Google
          account you choose. This permission cannot send, change, or delete
          email.
        </p>
        <div>
          <p className="font-medium text-foreground">How we use Gmail data</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            <li>
              When you search or open Gmail in AI Matrx, we retrieve the
              matching messages for that request. We do not create a synced
              copy of your whole mailbox.
            </li>
            <li>
              If you separately register this mailbox for outreach, AI Matrx
              checks new mail for replies and saves matched reply subject,
              thread and message identifiers, classification, and up to 20,000
              characters of the message body in CRM.
            </li>
          </ul>
        </div>
        <p>
          Disconnecting Gmail stops future reading. It does not erase reply
          data already saved in CRM.
        </p>
        <p>
          When you choose to run an AI agent on a CRM record, AI Matrx may add
          its saved email subject and message text to that agent&apos;s context
          and send it to the AI model provider configured for that agent.
        </p>
        <p>
          <Link
            href="/privacy-policy"
            className="font-medium text-primary underline underline-offset-2"
          >
            Read the Privacy Policy
          </Link>
        </p>
      </div>
    ),
    confirmLabel: "Allow Gmail reading",
    cancelLabel: "Back",
  });
}
