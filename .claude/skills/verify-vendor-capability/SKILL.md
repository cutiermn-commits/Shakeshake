---
name: verify-vendor-capability
description: Use before writing code that depends on any third-party API, SDK, free-tier limit or platform behaviour (Gemini, Supabase, Vercel, Oura, Web Push/iOS, USDA FDC). Confirms the capability against current official docs and records evidence.
---

# Verify vendor capability

Free tiers and APIs in this project change often. Never code from memory.

## Steps

1. **State the claim** you're about to rely on, in one line (e.g. "Supabase free plan supports scheduled Edge Functions").
2. **Find the official source**, in this order: vendor docs / API reference / OpenAPI spec → vendor changelog/release notes → vendor pricing/terms page. Secondary blogs only to locate the official page.
3. **Read the current page** (WebFetch). Note the page date or "last updated" if shown.
4. **Classify** the result:
   - VERIFIED — official source confirms it (record URL).
   - NOT VERIFIED — no authoritative evidence; do NOT build on it; propose an alternative or ask.
   - CONFLICT — sources disagree; show both, prefer the most authoritative, flag to owner.
5. **Check the $0 constraint**: does using it require a paid plan, a card on file, or commercial-use rights? If yes → stop and add a PROPOSED decision.
6. **Check privacy impact**: does data leave our stack? Is it used for training? Region restrictions? Update consent copy if needed.
7. **Record** the result in `docs/ARCHITECTURE.md` §8 Evidence register (new row or update) and, if it answers an open question, in `docs/DECISIONS.md`.
8. Only then write the code. Reference the evidence row in the PR/commit message.

## Known items to re-check at build time
- Gemini: which models are free for our project; current limits (AI Studio); data-use term; regional terms.
- Supabase: free-plan quotas, pause policy, scheduled jobs, Edge Function limits.
- Vercel Hobby: non-commercial clause; cron limits.
- iOS Web Push: Home Screen requirement, user-gesture permission.
- Oura: OAuth scopes, `daily_activity` fields, 10-user cap, membership requirement.
