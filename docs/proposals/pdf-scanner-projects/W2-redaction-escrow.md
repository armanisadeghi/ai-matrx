# W2 — Redaction Key Escrow (WAVE 2 — documented so it is not forgotten; do NOT assign yet)

> 2026-07-07 · **Assignment trigger:** the security team publishes the KMS wrapping interface.
> Master plan: [`README.md`](./README.md).

## Why it exists

Reversible redaction is live (spans in `redaction_mapping`, client-held AES keys; every
redaction audited in `pdf_redaction_audits` — wired 2026-06-11). The org-recovery half —
`pdf_redaction_key_escrow` — has its **data model in place but the write path intentionally
unwired**: keys must reach escrow *wrapped* by a KMS, never raw (`features/pdf/FEATURE.md`
§Data model). Building it before the KMS interface exists would mean storing raw keys — a
security regression dressed as progress.

## The design insight to keep fresh

The client already holds the AES key at redaction time; the only new motion is
`wrap(key) → escrow row` at that moment, plus an org-admin recovery flow
(`unwrap → decrypt spans`). No re-architecture — one write call and one admin surface.

## Draft scope

- FE: wrap-and-escrow call inside the existing redaction save path (single mutation path);
  org-admin recovery UI (list escrowed docs → recover spans). **Gate = org admin** (iam role
  checks inside the RPC), NOT platform super-admin — recovery is an org capability. The
  single-mutation-path + audit discipline still follows the `protected-resources` pattern.
- DB: RLS + `SECURITY DEFINER` RPC family for escrow reads/writes (one mutation path per
  protected table, org-admin-checked inside the RPC); audit-log trigger.
- aidream: nothing expected unless the KMS lives server-side.

## Draft DoD

1. Redacting with escrow enabled writes a wrapped key row; raw key never leaves the client
   unwrapped.
2. Org admin recovers a departed user's redacted doc end-to-end.
3. Every escrow read/write lands in the audit log; RLS verified deny-by-default.
