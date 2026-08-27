# Google Ads reporting

> **Status:** internal test · **Owner:** Marketing · **Updated:** 2026-08-27

`/marketing/ads` is the real reporting-only product used to prepare the separate Google Ads API and
restricted OAuth approvals. It is not part of Local Listings and does not share the Google Business
Profile campaign.

## Contract

- The code-controlled phase is `internal_test`; only a platform super admin can see, authorize, or
  run it before Google approval.
- Authorization requests only identity plus Google's single restricted `adwords` scope. It is never
  bundled with Workspace, Analytics, YouTube, Gmail, or Local Listings. The UI offers only already
  Ads-authorized connections for reporting and asks for a distinct identity during first consent;
  aidream rejects a provider-subject collision with an existing non-Ads connection before changing
  its metadata or Vault credential.
- The browser sends no developer token or refresh token. Aidream resolves the user's canonical
  Vault-backed Google connection and the platform-owned developer token server-side.
- Account discovery is explicit. A user selects one reachable customer account before any report.
- Reports are read-only, bounded to at most 32 inclusive days and 100 campaigns, and expose only
  campaign identity/status plus impressions, clicks, cost, conversions, and conversion value.
- No mutate, billing, planning, invitation, account-creation, keyword-plan, recommendation, or
  background-automation path exists.
- The provider surface stays behind the internal-test gate until both the Ads developer-token access
  program and Google's restricted-scope review are complete.

## Current gate

The correct `Arman` manager (`791-883-7982`) has Explorer Access and the API Center application
facts are complete. Google now requires a passkey before the existing developer token can be
revealed. The product and automated provider-boundary tests may proceed, but live account discovery
cannot pass until that token is placed in the canonical server runtime secret. The isolated Ads
identity must also be granted account access before its consent proof; never replace an existing
production Google connection merely to force the unapproved scope.

## Change log

- **2026-08-27** — Built the internal-test reporting path: minimum scope registry, canonical Google
  connection authorization, server-side account discovery, deliberate account selection, bounded
  campaign report, provider configuration errors, and read-only UI evidence.
