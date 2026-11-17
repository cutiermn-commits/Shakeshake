---
name: release-checklist
description: Use before declaring any milestone done or deploying Shake Shake. Runs the quality, privacy, cost and iPhone checks and reports honestly what passed, failed or wasn't tested.
---

# Release checklist

Report each item as PASS / FAIL / NOT TESTED (with reason). Never mark PASS without having run it.

## Build quality
- [ ] lint, typecheck, unit tests, RLS tests, Playwright happy path pass
- [ ] No secrets in client bundle (grep build output for key prefixes)
- [ ] Lighthouse mobile run: note PWA installability + performance

## iPhone (real device or closest available simulator — say which)
- [ ] Add to Home Screen → opens standalone, correct icon/name "Shake Shake"
- [ ] Push permission requested only on tap; test notification received
- [ ] Camera upload works; stored image compressed, EXIF/GPS removed
- [ ] Layout OK at 375 px and 430 px widths; safe-area insets respected

## Privacy & safety
- [ ] Consents separate, versioned, revocable; AI disabled when revoked
- [ ] Feed respects visibility + consent; health profile never exposed
- [ ] Export and delete-account work end-to-end (including storage objects)
- [ ] "Not medical advice" + AI data-use disclosure visible in onboarding and settings
- [ ] Allergy filter test passes; safety-mode copy triggers correctly

## Cost ($0)
- [ ] No paid service added; quotas configured (AI per-user/global, push caps)
- [ ] Storage usage vs 1 GB free limit recorded; retention job active
- [ ] Supabase project activity/pause risk noted

## Docs
- [ ] BACKLOG statuses updated; DECISIONS updated; evidence register current
- [ ] Known issues listed in the release note
