# Kick-off prompt for Claude Code

Copy this folder into an empty repo, open Claude Code in the repo root, and paste:

---

Read CLAUDE.md, then docs/PRODUCT_BRIEF.md, docs/ARCHITECTURE.md, docs/DECISIONS.md, docs/NUTRITION_RULES.md and docs/BACKLOG.md.

1. Summarise back to me in 10 bullets what you're building and the hard constraints, so I can confirm you understood.
2. List any contradictions or gaps you find across these docs.
3. Using the `verify-vendor-capability` skill, resolve open items O-003 (Gemini free-tier model + limits) and O-004 (Supabase scheduled jobs on the free plan). Update DECISIONS and the evidence register.
4. Propose the M0 implementation plan (files, commands, order). Wait for my approval before writing code.

Do not add any paid service. Label every claim VERIFIED / ASSUMPTION / NOT VERIFIED.

---

## Accounts you (Mani) need to create first — all free
- GitHub (repo)
- Supabase (free project, region closest to India — check options at creation)
- Google AI Studio (Gemini API key — free tier)
- Vercel (Hobby)
- Phase 2 only: Oura developer application (OAuth)
