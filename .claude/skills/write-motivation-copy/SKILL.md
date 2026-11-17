---
name: write-motivation-copy
description: Use when adding or editing any user-facing message in Shake Shake — push notifications, toasts, empty states, error messages, love notes, celebrations. Keeps the romantic + funny + motivating voice safe and consistent.
---

# Write motivation copy

Read `docs/TONE_AND_COPY.md` first. It is the source of truth.

## Checklist for every new message
- [ ] Fits a defined category/trigger (or add the category to TONE_AND_COPY §4 first).
- [ ] Romantic = warm and affectionate, suitable for ANY user (not only the owner's partner). Nothing possessive, sexual or creepy.
- [ ] Funny = teases situations or food, never the person.
- [ ] No body/weight/looks comments. No food moralising ("cheat", "guilty", "burn it off", "earn it").
- [ ] Missed-day copy is kind, never shaming.
- [ ] Push ≤ 140 characters, ≤ 2 emojis.
- [ ] Original wording — no song lyrics, film dialogue or copyrighted taglines.
- [ ] Understandable to non-Tamil speakers if it uses Tanglish words.
- [ ] Not a duplicate of an existing message.

## How to add
1. Add the text to TONE_AND_COPY §5 under its category.
2. Add it to the seed migration/fixture for the `messages` table with `category`, `trigger`, `tone_tags`.
3. If it's a new trigger, implement the trigger in the message engine respecting caps, quiet hours and the 21-day no-repeat rule.
4. Never use playful copy when the safety mode in NUTRITION_RULES §7 is active.
