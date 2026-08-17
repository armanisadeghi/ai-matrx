# Matrx Extend demo page

## Purpose

`/matrx-extend-demo` is a stable, public, account-free page for demonstrating and testing the normal Matrx Extend user experience. It is not a privileged reviewer mode and contains no extension-specific behavior. It is simply predictable page content: an article, a semantic table, links, metadata, and JSON-LD.

## Invariants

- The page remains public and usable without an AI Matrx account.
- The three workflow stages remain **Capture**, **Understand**, and **Use** so reviewer instructions and page-aware chat have a deterministic answer.
- The page keeps ordinary semantic HTML plus JSON-LD; it must never detect the extension or return special content to a reviewer.
- Links to the extension privacy policy and support remain direct and functional.
- Submission instructions and screenshots that depend on this page live canonically in `matrx-extend/docs/CWS_LISTING_DRAFT.md`.

## Change log

- 2026-08-17 — Added the stable public demonstration page for clean-profile Chrome Web Store testing and reviewer reproduction.
