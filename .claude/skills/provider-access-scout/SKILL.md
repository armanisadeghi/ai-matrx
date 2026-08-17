---
name: provider-access-scout
description: "Produce decision-ready scouting records for third-party OAuth, API, API-key, remote MCP, publisher, marketplace, and partner-access campaigns. Use for assigned Provider Access Launch tasks when current official requirements, minimum scopes, cost, account needs, evidence, approval path, implementation consumer, and an easy-execution verdict must be established before submission."
---

<!-- SYNCED COPY — do not edit here.
     Canonical: common-docs/skills/provider-access-scout/SKILL.md
     This file is distributed to every consuming repo by
     common-docs/meta/scripts/sync_skills.py. Edit the canonical, run the
     sync, and commit each repo. Edits made here are overwritten and lost. -->

# Scout Provider Access

Scout five assigned campaigns by default. Finish each record independently so a submission agent can
continue without rereading the entire web or repeating portal discovery.

## Before research

1. Read `common-docs/systems/provider-access/FEATURE.md` when available.
2. Open the assigned task and set `status=active`, `Phase: scouting`, and yourself as owner using the
   normal Projects/Tasks product path.
3. Inventory existing implementation and assets before proposing access:
   - live MCP catalog and tool definitions;
   - first-party integration and external MCP connection records;
   - provider code, UI, and tests;
   - existing plugins and detailed provider plans;
   - CRM provider/interactions and Vault definition metadata.
4. If the campaign has no implemented or immediately testable user outcome, recommend “do not
   request yet.” Access for a hypothetical future enhancement is not launch progress.

## Research standard

Use current official developer docs, policy/terms pages, pricing, portal instructions, and help
center material. Verify facts that can change in the live portal when docs are incomplete. Record the
date and direct official URL for every approval, scope, cost, production, or review claim. Treat
third-party guides only as search leads.

Answer all of these:

1. What exact user outcome does AI Matrx already implement or can verify now?
2. Which access route is canonical: no-auth, official remote MCP, OAuth self-service, reviewed OAuth,
   API key, partner program, publisher enrollment, marketplace, or customer-specific activation?
3. What exact scopes/capabilities are required? Map each to the product action, code consumer,
   reviewer-visible UI, and verification operation.
4. Which offered scopes must not be requested now, and why?
5. Is developer/sandbox access distinct from production access?
6. Are fees, contracts, billing, legal-entity verification, business verification, compliance or
   regulated-data attestations, customer sponsorship, DNS, app publication, or quotas involved?
7. What account/role is required, and can the dedicated `info@aimatrx.com` profile use Google SSO?
8. Which redirects, domains, privacy/terms/support URLs, screenshots, videos, test credentials, or
   reviewer instructions are needed?
9. What confirmation/case ID will result, how long does the provider say review takes, where is
   status visible, and what is the escalation/support route?
10. How is access revoked and reconnected?

## Scope rule

Choose the least privilege that completes the implemented outcome: read before write, resource-
specific before account-wide, and incremental consent at the moment of use. Separate unrelated scope
families or reviewer stories. If a scope cannot be tied to an implemented action, code consumer,
visible UI, and real verification, recommend that it not be requested.

## Easy-execution verdict

Classify `easy_execute` only if every answer is yes:

- free and reversible, with no billing or contract;
- AI Matrx-owned account and approved publisher facts;
- no legal, compliance, regulated-data, customer, or identity attestation;
- no production DNS, customer-facing publication, customer data, or live-traffic mutation;
- only minimum documented non-sensitive access for an implemented capability;
- private/development mode remains possible when offered;
- immediate verification and revocation are known.

If any answer is no or uncertain, set `easy_execute: false`, leave `Phase: ready_to_submit` only when
the recommendation is complete, and name the exact decision or prerequisite. “Free signup” alone
does not make a production publisher review easy.

Business ease never overrides an active tool/browser confirmation boundary. External account
creation, persistent API/OAuth key creation, representational submissions, and sent messages still
pause at the action boundary required by the current environment.

## Required scouting record

Update the task case card and append a dated scouting section containing:

```text
Verdict: easy_execute | ready_for_owner | do_not_request_yet | no_auth_needed
Implemented outcome:
Access route:
Minimum scopes/capabilities:
Explicitly excluded:
Developer vs production:
Cost/contract:
Account/business/compliance requirements:
Required assets:
Submission URL:
Expected receipt/status surface:
Provider-stated review timing:
Revocation/reconnect:
Risks and open decisions:
Official sources (verified YYYY-MM-DD):
Exact next action:
Next check:
```

Resolve or link the provider `crm.party` when possible. Do not create a CRM interaction for merely
reading docs. At completion, leave the task `planned` when decision-ready but not started, or
`active` only when submission/follow-up is already underway. Never leave `active` without a next
action or due check.

## Example requests

- “Use `$provider-access-scout` on the next five P0 remote MCP campaigns.”
- “Use `$provider-access-scout` on Epic FHIR and distinguish sandbox from production.”
- “Use `$provider-access-scout` on Meta Ads and identify the smallest implemented permission set.”
