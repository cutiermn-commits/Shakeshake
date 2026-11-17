# Tone & Copy — Shake Shake

*Status: v0.1 · 2026-11-17*

## 1. Voice

- **No persona, no audio.** Just text — cards, toasts, push notifications, empty states.
- **Romantic** (warm, adoring, a little flirty — like a love note on the fridge), **funny** (puns, gentle teasing, South Indian food humour), **motivating** (celebrates effort and consistency).
- The same library goes to every user, so romance must read as *warm and affectionate*, never possessive, sexual or creepy.
- Light Tanglish/Indian-English flavour is welcome ("semma", "super-a irukku", "da/di" avoided — gender-neutral). Keep it understandable to all.

## 2. Hard rules

1. **Never** comment on body shape, weight or looks.
2. **Never** moralise food ("bad", "cheat", "guilty", "burn it off", "earn your dinner").
3. **Never** shame a missed day; missed = curious and kind.
4. Teasing targets **situations** (the lonely paneer in the fridge), never the person.
5. If the safety rule in NUTRITION_RULES §7 triggers → switch to caring tone only, no jokes.
6. Max **140 characters** for push; ≤ 2 emojis.
7. No fake urgency, no dark patterns.

## 3. Frequency (ASSUMPTION — tune with the user)

| Slot | When | Max |
|---|---|---|
| Morning hello + today's protein idea | ~07:30 local | 1/day |
| Lunch suggestion ready | ~11:30 | 1/day |
| Plate-photo reminder | chosen meal time + 30 min | 1 per chosen meal |
| Dinner suggestion | ~18:00 | 1/day |
| Celebration (goal hit / streak / leaderboard) | event-driven | 1/day |
- **Total cap: 4 pushes/day**, quiet hours 22:00–07:00. Everything else shows in the in-app message centre.
- Don't repeat the same message to the same user within 21 days (`message_sends`).

## 4. Message categories & triggers

`morning` · `suggestion_ready` · `swap` · `plate_reminder` · `logged_thanks` · `protein_hit` · `protein_close` · `streak` · `missed_day` · `burn_logged` · `leaderboard_up` · `leaderboard_week_won` · `weekly_plan` · `grocery_ready` · `love_note` (random, ≤ 2/week) · `empty_state` · `error_friendly`

## 5. Seed library (original copy — extend with the `write-motivation-copy` skill)

### morning
- Good morning, gorgeous. Your muscles had a dream about chicken chettinad. Let's make it come true. 💪
- Rise and shine! Today's plan: be amazing, eat protein, repeat.
- Coffee first. Then we conquer the day — and lunch.
- The sun is up, and so are your gains. Let's go!
- New day, new dosa… a protein-packed one, obviously.

### suggestion_ready
- Lunch idea is ready and honestly? It's flirting with you. 😋
- Tonight's dinner has 35 g of protein and zero protein shakes. Just saying.
- Your lunch suggestion just walked in looking delicious.
- Plot twist: dinner is healthy AND tasty. Tap to see.

### swap
- Not feeling it? No heartbreak here — let's find you a better match.
- Swapped! The new one tried harder.
- Fussy? We love that. Here are three more options.

### plate_reminder
- Show me your plate! 📸 Your lunch deserves a photoshoot.
- Psst… the meen kuzhambu wants its close-up.
- Before you dig in — one quick pic, then enjoy every bite.
- Camera eats first. (It's a Chennai rule now.)

### logged_thanks
- Logged! You're officially more organised than my kitchen.
- Saved. That plate looked like it had a great personality.
- Done! Data never tasted this good.

### protein_hit
- Protein goal: CRUSHED. Your muscles are writing you a thank-you letter. 💌
- 100 % protein today. Someone call the newspapers.
- Goal hit! The protein shake industry is shaking. 🥤😱
- You did it — real food, real protein, really proud of you.

### protein_close
- Just a few grams away — a bowl of thayir or a boiled egg would close the deal.
- So close! One sundal snack and you're there.

### streak
- 3 days in a row! You're on fire (the good, tadka kind). 🔥
- 7-day streak! A full week of showing up for yourself. Beautiful.
- 14 days. At this point, consistency should be paying you rent.
- 30-day streak! Framing this. Hanging it in my heart.

### missed_day
- We missed you yesterday! No stress — today's a fresh plate.
- Life happened? Totally fine. Let's pick one easy win today.
- The app was lonely without you. Lunch idea's waiting whenever you are.

### burn_logged
- Burn logged. Your Oura ring is proud. So am I.
- Calories out: noted. Snack respectfully. 😄
- You moved, you grooved, you logged it. Love that for you.

### leaderboard_up
- You just climbed the leaderboard. Friends, take notes.
- Up you go! Somebody's friends are getting nervous.

### leaderboard_week_won
- Champion of the week! 👑 Your crown is made of paneer.
- Weekly winner! Victory tastes like pepper chicken.

### weekly_plan
- Sunday planning time! 7 days of protein, zero "what should I cook?"
- Your week, sorted. Future-you says thank you.

### grocery_ready
- Grocery list ready. The vegetable vendor won't know what hit him.
- Shopping list done — don't forget the curry leaves, they're the real MVP.

### love_note (random, ≤ 2/week)
- Reminder: you're strong, you're lovely, and your sambar is legendary.
- Somewhere, a protein shake is crying because you chose real food. Proud of you.
- You make healthy look like an art form.
- If dedication were a dish, you'd be a full South Indian thali.

### empty_state
- No meals logged yet — the plate is clean and full of possibility.
- No friends here yet. Invite someone to share the snacks (and the leaderboard).

### error_friendly
- Our AI chef dropped the ladle. Try again, or log it manually.
- The kitchen's a bit busy right now — manual entry works perfectly meanwhile.
- Too many recipe requests today! We'll be back tomorrow, fresher than idli batter.

### caring (safety mode — no jokes)
- We've noticed some very light days. Your body deserves fuel — if things feel hard, talking to a doctor or dietitian can really help. 💛
