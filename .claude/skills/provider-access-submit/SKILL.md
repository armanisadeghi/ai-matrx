---
name: provider-access-submit
description: "Execute an approved third-party provider access campaign end to end: account or app registration, exact scopes, reviewer assets, secure credential storage, receipt capture, canonical connection, real verification, and task/CRM updates. Use only after scouting is complete and any required owner decision or action-time confirmation has been satisfied."
---

<!-- SYNCED COPY — do not edit here.
     Canonical: common-docs/skills/provider-access-submit/SKILL.md
     This file is distributed to every consuming repo by
     common-docs/meta/scripts/sync_skills.py. Edit the canonical, run the
     sync, and commit each repo. Edits made here are overwritten and lost. -->

# Submit Provider Access

Execute one campaign or a small related batch without scope creep. The scouting record is the
submission brief; stop and rescout if the live portal materially disagrees.

## Preconditions

1. Read `common-docs/systems/provider-access/FEATURE.md` when available.
2. The campaign key is unique; the task contains a current official-source scouting record.
3. Every requested scope maps to an implemented product action and verification operation.
4. The task is `Phase: ready_to_submit`, or the scout recorded `easy_execute` and every gate passed.
5. Any legal, billing, compliance, regulated-data, identity, DNS, publication, customer-impact, or
   material scope choice has an explicit owner decision.
6. The active browser/tool action-time confirmation is satisfied before final external account
   creation, persistent key/OAuth creation, representational submission, or sent message.

If a precondition fails, update the exact blocker and stop before changing provider state.

## Account and secret handling

- Exhaust existing CLI/API credentials, Vault entries, service identities, and authenticated browser
  sessions before asking Arman to log in.
- Use the dedicated `info@aimatrx.com` Chrome profile and Google SSO where supported.
- Never guess publisher/legal/compliance facts. Read them from the approved Vault profile.
- Never store a password in the browser or paste a credential value into tasks, docs, CRM, shell
  arguments, logs, screenshots, or Git.
- Put passwords, API keys, client secrets, TOTP/recovery material, and protected files into the
  AI Matrx organization Vault through the normal product/service surface.
- Invoke `secret-location-audit` after creating, rotating, or retiring a credential.

## Execution

1. Set the task `active`, `Phase: submitting`, owner, and exact current action.
2. Re-open the official requirements and compare the live form with the scouting record.
3. Reuse the existing provider account/application when the campaign records one. Do not create a
   second app to escape a confusing state.
4. Enter only approved canonical publisher data and only the scouted scopes/capabilities.
5. Prepare requested evidence using the actual product:
   - stable public homepage/privacy/terms/support URLs;
   - focused screenshots of the implemented flow;
   - an unlisted/public reviewer video showing consent, user action, result, and disconnect/revoke;
   - reviewer instructions and test credentials through the provider's protected mechanism.
6. Immediately before the final provider-changing click, confirm the live form still matches the
   authorized action. Submit only once.
7. Capture the non-secret receipt: app/account/project ID, case ID, exact scopes, timestamp, actor,
   submitted URLs, evidence links, provider status, and stated review timing.
8. Record consequential outbound/inbound communication as `crm.interaction`, retaining provider
   thread/message IDs when available. Link it from the task.
9. Set `Phase: awaiting_provider`, `status=planned`, and the next due check, or continue to
   verification when access is immediate. `active` means someone is working now; waiting is planned.

## Verification

Do not complete the task because a portal says “created” or “approved.” Verify all applicable steps:

1. Store/connect through the canonical Vault-backed integration or MCP path.
2. Discover the intended capability or tools.
3. Perform one real least-privilege operation through the user-facing or canonical aidream path.
4. Confirm the task, `users.integration_connections` or `tool.mcp_user_conn`, and provider portal
   agree.
5. Record revoke/disconnect/reconnect instructions and evidence.
6. Set `Phase: verified` and `status=completed` only after the proof succeeds.

If immediate developer/sandbox access works but production activation remains, record and verify the
developer milestone without falsely completing the production campaign. Split the campaign only if
the development access is independently useful and ongoing.

## Failure handling

- Validation error before submission: fix the record/form and retry only when the provider confirms
  no case was created.
- Unknown result after final click: inspect email, portal, and network/receipt state before retrying.
- Rejection: set `Phase: rejected`, preserve the exact reason, prepare the smallest compliant repair,
  and set the next decision/check.
- New material requirement: return to scouting; do not improvise an attestation.
- CAPTCHA, hardware key, signature, payment, identity verification, or regulated commitment: set
  `Phase: blocked_owner` with the exact one-step owner action.

## Example requests

- “Use `$provider-access-submit` to connect the approved Notion remote MCP campaign.”
- “Use `$provider-access-submit` for the Bing Webmaster API-key route after the action boundary.”
- “Use `$provider-access-submit` to prepare Google’s reviewer response, stop before sending, and
  show the exact final action.”
