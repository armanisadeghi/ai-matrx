// lib/stripe/connect-requirements.ts
//
// Stripe's requirement codes, in words our user can act on.
//
// Stripe answers "what is still missing from this connected account" with an
// open-ended list of DEVELOPER strings: `individual.verification.document`,
// `external_account`, `tos_acceptance.date`, `person_1MqEr.relationship.title`.
// Our user is a brilliant, absolutely non-technical expert — a doctor selling a
// class. `individual.verification.document` is not a sentence they can act on,
// and putting it on screen is the same defect as showing a stack trace.
//
// Pure and dependency-free, so both the client checklist and any server surface
// read the SAME words. No I/O, no Stripe SDK.
//
// THE OPEN-LIST RULE: Stripe adds codes whenever it likes, and a code we have
// never seen must still produce a usable sentence — never a blank row and never
// the raw string. `describeStripeRequirement` therefore always returns copy:
// exact match → prefix family → a humanised fallback that at least names the
// subject. When you meet a real code the fallback handles badly, add it here
// rather than special-casing it at a call site.

/** How we describe one outstanding requirement. */
export interface RequirementCopy {
  /** The step title — what the user must produce. */
  title: string;
  /** One sentence of what it is and why Stripe wants it. */
  description: string;
  /** True when we recognised the code rather than falling back to humanising it. */
  known: boolean;
}

/**
 * Strip the noise Stripe wraps around a field name:
 *   `person_1MqEr9.verification.document` → `verification.document`
 *   `individual.verification.document`    → `verification.document`
 *   `company.address.line1`               → `address.line1`
 * The owner prefix tells us WHOSE detail it is, which for an Express account
 * (always the creator themselves) adds nothing the user needs.
 */
function coreField(code: string): string {
  return code.replace(/^(person_[^.]+|individual|company|representative)\./, "");
}

const EXACT: Record<string, Omit<RequirementCopy, "known">> = {
  external_account: {
    title: "Add the bank account you want to be paid into",
    description:
      "Stripe sends your earnings straight to your bank. Until there's an account to send them to, the money stays with Stripe.",
  },
  "verification.document": {
    title: "Send a photo of your ID",
    description:
      "A passport or driving licence. Stripe has to confirm you are who you say you are before it can pay you — this is the law, not our rule.",
  },
  "verification.additional_document": {
    title: "Send one more document",
    description:
      "Stripe looked at what you sent and needs a second piece — usually something with your address on it, like a bank statement or a utility bill.",
  },
  "id_number": {
    title: "Add your tax or ID number",
    description:
      "Stripe is required to hold this for anyone it pays. It is not shown to anyone who buys from you.",
  },
  "ssn_last_4": {
    title: "Add the last 4 digits of your Social Security number",
    description:
      "Stripe uses these to confirm your identity. It is not shown to anyone who buys from you.",
  },
  "dob.day": {
    title: "Add your date of birth",
    description: "Stripe has to confirm you are old enough to be paid.",
  },
  "first_name": {
    title: "Add your first name",
    description: "It has to match the name on the ID you send.",
  },
  "last_name": {
    title: "Add your last name",
    description: "It has to match the name on the ID you send.",
  },
  email: {
    title: "Add your email address",
    description: "Where Stripe sends payout notices and receipts.",
  },
  phone: {
    title: "Add your phone number",
    description: "Stripe uses it to confirm it's really you signing in.",
  },
  "address.line1": {
    title: "Add your address",
    description: "It has to match the address on your documents.",
  },
  "address.postal_code": {
    title: "Add your postcode",
    description: "It has to match the address on your documents.",
  },
  "address.city": {
    title: "Add your city",
    description: "It has to match the address on your documents.",
  },
  "address.state": {
    title: "Add your state or region",
    description: "It has to match the address on your documents.",
  },
  business_type: {
    title: "Say whether you're paid as a person or a business",
    description:
      "If you don't have a registered company, you're an individual — that's the usual answer.",
  },
  "business_profile.url": {
    title: "Add a link to your page",
    description:
      "Stripe wants to see where you sell. Your public creator page works for this.",
  },
  "business_profile.product_description": {
    title: "Describe what you sell in a sentence",
    description:
      "Stripe reads this to check the sale is something it can process. \"Online classes\" is enough.",
  },
  "business_profile.mcc": {
    title: "Pick the category that fits what you sell",
    description: "Stripe uses it to classify your sales. Education fits most classes.",
  },
  "tos_acceptance.date": {
    title: "Accept Stripe's terms",
    description:
      "Stripe's own agreement with you, separate from ours. It takes one click in their form.",
  },
  "relationship.title": {
    title: "Add your job title",
    description: "Stripe asks for the role you hold in the business you're paid as.",
  },
};

/**
 * Whole FAMILIES of codes, by prefix, for the ones Stripe generates open-ended
 * variants of. Checked after the exact table, longest prefix first.
 */
const PREFIXES: [string, Omit<RequirementCopy, "known">][] = [
  [
    "verification",
    {
      title: "Finish confirming your identity",
      description:
        "Stripe needs one more piece of proof before it can pay you. Their form shows exactly what.",
    },
  ],
  [
    "documents",
    {
      title: "Send Stripe a document",
      description:
        "Stripe is asking for paperwork it can check. Their form shows exactly which.",
    },
  ],
  [
    "address",
    {
      title: "Complete your address",
      description: "It has to match the address on your documents.",
    },
  ],
  [
    "dob",
    {
      title: "Add your date of birth",
      description: "Stripe has to confirm you are old enough to be paid.",
    },
  ],
  [
    "business_profile",
    {
      title: "Complete your business details",
      description: "Stripe wants a little more about what you sell.",
    },
  ],
  [
    "tos_acceptance",
    {
      title: "Accept Stripe's terms",
      description: "Their agreement with you, separate from ours. One click in their form.",
    },
  ],
  [
    "owners",
    {
      title: "Add the people who own the business",
      description: "Stripe has to know who is behind an account it pays.",
    },
  ],
  [
    "relationship",
    {
      title: "Say what your role is",
      description: "Stripe asks how you relate to the business you're paid as.",
    },
  ],
  [
    "settings",
    {
      title: "Finish a payout setting",
      description: "One of Stripe's payout options still needs an answer.",
    },
  ],
];

/** `verification.additional_document` → "verification additional document". */
function humanise(field: string): string {
  return field
    .split(".")
    .join(" ")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * One Stripe requirement code, in the user's words. Always returns usable copy
 * — an unrecognised code still names its subject rather than showing the raw
 * string or, worse, nothing at all.
 */
export function describeStripeRequirement(code: string): RequirementCopy {
  const field = coreField(code);

  const exact = EXACT[field];
  if (exact) return { ...exact, known: true };

  for (const [prefix, copy] of PREFIXES) {
    if (field === prefix || field.startsWith(`${prefix}.`)) {
      return { ...copy, known: true };
    }
  }

  const subject = humanise(field);
  return {
    title: `Stripe still needs your ${subject}`,
    description:
      "Stripe asked for this before it can pay you. Their form walks you through it.",
    known: false,
  };
}

/**
 * `disabled_reason` — why Stripe has payouts switched off — as a sentence.
 * Some of these are NOT the user's to fix (a review, a rejection), and saying
 * "do something" about them would send the user in circles.
 */
export function describePayoutsDisabledReason(reason: string | null): string {
  switch (reason) {
    case null:
    case undefined:
      return "Stripe hasn't switched payouts on yet.";
    case "requirements.past_due":
      return "Stripe is waiting on details from you, and the date it wanted them by has passed.";
    case "requirements.pending_verification":
      return "Stripe is checking what you sent. There's nothing to do but wait — it's usually a day or two.";
    case "under_review":
      return "Stripe is reviewing your account. There's nothing to do but wait.";
    case "listed":
    case "rejected.listed":
      return "Stripe can't pay this account. Their support team is the only one who can explain why.";
    case "rejected.fraud":
    case "rejected.terms_of_service":
    case "rejected.other":
      return "Stripe has declined this account. Their support team is the only one who can explain why.";
    case "platform_paused":
    case "platform_disabled":
      return "Payouts on this account are paused. Get in touch and we'll look into it.";
    case "other":
      return "Stripe hasn't switched payouts on yet, and hasn't told us why. Opening your Stripe details usually shows what's left.";
    default:
      // An unrecognised reason is still a real reason — never swallow it.
      return "Stripe hasn't switched payouts on yet. Opening your Stripe details shows what's left.";
  }
}

/**
 * True when the reason is Stripe thinking, not the user owing something. The
 * difference matters: telling someone to "finish your details" while Stripe is
 * mid-review sends them to a form with nothing left to fill in.
 */
export function payoutsWaitingOnStripe(reason: string | null): boolean {
  return (
    reason === "requirements.pending_verification" || reason === "under_review"
  );
}
