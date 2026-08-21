"use client";

/**
 * /marketing/email — the Marketing pillar's FRONT DOOR to email.
 *
 * THE DECISION THIS PAGE RECORDS (2026-08-19): today, "email" in this platform
 * IS Lane B — cold outreach sent from the customer's OWN verified mailbox. That
 * is what ships: sending identities, message templates, the cadence runner, the
 * inbox. So this route opens those.
 *
 * Lane A — opt-in marketing email we send on the customer's behalf (lists,
 * broadcasts, lifecycle automation, consent as a hard eligibility gate) — is
 * COMMITTED VISION, deliberately sequenced after Lane B
 * (`docs/handoffs/outreach-system.md` §5.1 and its Lane A section). It is NOT
 * dropped: it stays a registered promise (`marketing.email.opt-in-campaigns`)
 * printed on this page, because deleting it would be the one unrecoverable
 * mistake here.
 *
 * The two lanes must never blend (§7), which is exactly why this page sends the
 * user to the Lane B surfaces by name rather than offering a generic "send
 * email" button that could mean either.
 */

import { useEffect, useState } from "react";
import { Building2, FileText, MailCheck, Send } from "lucide-react";

import { useCrmContext } from "@/features/crm/hooks/useCrmContext";
import { listSendingIdentities } from "@/features/crm/sending-identities/service";
import { getComingSoon } from "@/lib/coming-soon/registry";
import {
  MarketingDoorBoard,
  MarketingFrontDoorPage,
  MarketingFrontDoorPromise,
  type MarketingDoor,
} from "./MarketingDoorBoard";

const LANE_A_PROMISE_ID = "marketing.email.opt-in-campaigns";

export function EmailFrontDoor() {
  const ctx = useCrmContext();
  const promise = getComingSoon(LANE_A_PROMISE_ID);
  const [mailboxes, setMailboxes] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    // The mailbox count is aidream's, not Supabase's. A failure leaves the door
    // without a number rather than without a door.
    void listSendingIdentities()
      .then((rows) => {
        if (!cancelled) setMailboxes(rows.length);
      })
      .catch(() => {
        if (!cancelled) setMailboxes(-1);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const doors: MarketingDoor[] = [
    {
      label: "Sending mailboxes",
      href: "/crm/sending-identities",
      description:
        "Every email leaves from your own mailbox on your own verified domain — connect it, prove the domain, warm it up, and watch its delivery health here.",
      Icon: MailCheck,
      count: mailboxes === null ? null : mailboxes < 0 ? undefined : mailboxes,
      countLabel: mailboxes === 1 ? "mailbox" : "mailboxes",
    },
    {
      label: "Message templates",
      href: "/chat/message-templates",
      description:
        "The messages themselves, with merge fields that refuse to send when a value is missing. Your own templates and the shared public ones.",
      Icon: FileText,
    },
    {
      label: "Campaigns & sequences",
      href: "/crm/outreach-lists",
      description:
        "Where email actually goes out: who is enrolled, which step is next, and the sequence that stops the moment somebody replies.",
      Icon: Send,
    },
  ];

  // THE DOOR LAW: templates that campaigns send from are ORGANIZATION
  // templates, and every org the user belongs to has its own library. Naming
  // the org without opening it would be the dead end.
  const orgDoors: MarketingDoor[] = (ctx?.orgIds ?? []).map((orgId) => ({
    label: ctx?.orgNames[orgId] ?? "Organization",
    href: `/organizations/${orgId}/templates`,
    description:
      "This organization's shared template library — the one campaigns for this org send from.",
    Icon: Building2,
  }));

  return (
    <MarketingFrontDoorPage
      title="Email"
      lede="Email today means outreach sent from your own verified mailbox — the mailbox, the message, and the sequence. Opt-in list marketing is a separate, later lane."
    >
      <MarketingDoorBoard
        title="Sending email"
        description="Cold outreach never touches AI Matrx infrastructure — it leaves from your own domain, which is what keeps your deliverability yours."
        doors={doors}
      />

      {orgDoors.length > 0 ? (
        <MarketingDoorBoard
          title="Organization template libraries"
          description="A campaign sends from its organization's templates."
          doors={orgDoors}
        />
      ) : null}

      {promise ? (
        <MarketingFrontDoorPromise
          label={promise.label}
          promise={promise.promise}
        />
      ) : null}
    </MarketingFrontDoorPage>
  );
}
