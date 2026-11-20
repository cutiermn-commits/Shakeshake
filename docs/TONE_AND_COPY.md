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

`morning` · `suggestion_ready` · `swap` · `plate_reminder` · `logged_thanks` · `protein_hit` · `protein_close` · `streak` · `missed_day` · `burn_logged` · `leaderboard_up` · `leaderboard_week_won` · `weekly_plan` · `grocery_ready` · `love_note` (random, ≤ 2/week) · `empty_state` · `error_friendly` · `loading` (in-app, while the AI works) · `chosen` (in-app, after choosing a meal)

## 5. Seed library (original copy — extend with the `write-motivation-copy` skill)

### morning
- Good morning, gorgeous. Your muscles had a dream about chicken chettinad. Let's make it come true. 💪
- Rise and shine! Today's plan: be amazing, eat protein, repeat.
- Coffee first. Then we conquer the day — and lunch.
- The sun is up, and so are your gains. Let's go!
- New day, new dosa… a protein-packed one, obviously.

- Morning, sunshine. The dal is soaking, the day is yours. ☀️
- Good morning! Today's forecast: 100% chance of a great lunch.
- Rise and shine. Somewhere a boiled egg is already rooting for you.
- Fresh day, fresh chutney, same wonderful you.
- Good morning! Filter coffee first, then we plan something delicious.
- New day unlocked. Protein quests available: two. Rewards: tasty.
- Hello, early bird! Breakfast first — the protein adventure starts at lunch.
- Wakey wakey. Your kitchen called — it misses your cooking already.
### suggestion_ready
- Lunch idea is ready and honestly? It's flirting with you. 😋
- Tonight's dinner has 35 g of protein and zero protein shakes. Just saying.
- Your lunch suggestion just walked in looking delicious.
- Plot twist: dinner is healthy AND tasty. Tap to see.

- Lunch idea just arrived, smelling of curry leaves and good decisions.
- Tonight's dinner idea is ready. It's high in protein and low on drama.
- Psst — your next meal idea is ready, and it's showing off a little.
- New idea plated up. Spoiler: there's a tadka involved.
- Your dinner suggestion has entered the chat. 🍛
### swap
- Not feeling it? No heartbreak here — let's find you a better match.
- Swapped! The new one tried harder.
- Fussy? We love that. Here are three more options.

- Swapped! Plenty more dosas in the sea.
- Done. The old idea has been sent back to the kitchen with love.
- New match found. This one swipes right on protein.
- Swapped! Even the sambar respects a person who knows what they want.
- Fresh options coming up — being picky is a form of self-care.
### plate_reminder
- Show me your plate! 📸 Your lunch deserves a photoshoot.
- Psst… the meen kuzhambu wants its close-up.
- Before you dig in — one quick pic, then enjoy every bite.
- Camera eats first. (It's a Chennai rule now.)

- Plate check! Strike a pose — the plate's pose, not yours. 📸
- Before the first bite: one photo for the album of good decisions.
- Lights, camera, kuzhambu! Snap your plate, then dig in.
- Your plate is camera-ready. One quick click, then it's all yours.
- Paparazzi alert: your dinner would like its photo taken.
### logged_thanks
- Logged! You're officially more organised than my kitchen.
- Saved. That plate looked like it had a great personality.
- Done! Data never tasted this good.

- Logged! Your future self just sent a thank-you note.
- Saved. Data entry has never looked this delicious.
- Done and dusted, like a perfect dosa flip.
- Got it! You're on a roll.
- Logged. The spreadsheet in my heart is very happy.
- Noted, with a chef's kiss. 👌
### protein_hit
- Protein goal: CRUSHED. Your muscles are writing you a thank-you letter. 💌
- 100 % protein today. Someone call the newspapers.
- Goal hit! The protein shake industry is shaking. 🥤😱
- You did it — real food, real protein, really proud of you.

- Protein target reached! Somewhere, a gym towel just swooned.
- Goal done. Real food, real effort, really proud of you. 💛
- Protein: complete. Achievement unlocked: Sambar Champion.
- You hit your protein today. The dal deserves a standing ovation too.
### protein_close
- Just a few grams away — a bowl of thayir or a boiled egg would close the deal.
- So close! One sundal snack and you're there.

- Almost there — a handful of roasted chana would seal the deal.
- So close! A glass of buttermilk is basically a protein high-five.
- A few grams to go. An egg is small but mighty.
- Nearly done! A little sundal would finish the job beautifully.
### streak
- 3 days in a row! You're on fire (the good, tadka kind). 🔥
- 7-day streak! A full week of showing up for yourself. Beautiful.
- 14 days. At this point, consistency should be paying you rent.
- 30-day streak! Framing this. Hanging it in my heart.

- 5 days straight! You're more consistent than the morning milk delivery.
- 10-day streak! Even the pressure cooker whistles in your honour.
- 21 days. That's not a streak any more — that's a lifestyle.
- Another day, another tick. Love watching this chain grow. 🔥
### missed_day
- We missed you yesterday! No stress — today's a fresh plate.
- Life happened? Totally fine. Let's pick one easy win today.
- The app was lonely without you. Lunch idea's waiting whenever you are.

- Yesterday took a holiday. Today is a great day to come back.
- No log yesterday? No problem. One small meal at a time.
- Missed you! The recipe ideas kept your seat warm.
### burn_logged
- Burn logged. Your Oura ring is proud. So am I.
- Calories out: noted. Snack respectfully. 😄
- You moved, you grooved, you logged it. Love that for you.

- Steps logged. The pavement says thank you.
- Burn saved! Your Oura ring and I are both impressed.
- Active calories noted. You moved; the app grooved.
- Logged. Movement is a love letter to future you.
### leaderboard_up
- You just climbed the leaderboard. Friends, take notes.
- Up you go! Somebody's friends are getting nervous.

- Climbing the board like a curry leaf in hot oil — fast and sizzling.
- Up a spot! Your friends just felt a mysterious chill.
- New position on the board. The podium is calling.
### leaderboard_week_won
- Champion of the week! 👑 Your crown is made of paneer.
- Weekly winner! Victory tastes like pepper chicken.

- Week won! The crown is yours — garnished with coriander. 👑
- Champion! This week's trophy is a golden ladle.
- Top of the board! Celebrate with something delicious (and protein-rich).
### weekly_plan
- Sunday planning time! 7 days of protein, zero "what should I cook?"
- Your week, sorted. Future-you says thank you.

- Sunday sorted: seven lunches, seven dinners, zero 'what's for dinner?'
- Your week is planned. Future-you is doing a happy dance.
- Plan ready! Monday-you will feel very organised.
### grocery_ready
- Grocery list ready. The vegetable vendor won't know what hit him.
- Shopping list done — don't forget the curry leaves, they're the real MVP.

- Grocery list ready. Market mission accepted. 🛒
- List done! The fish seller won't know what hit him.
- Shopping list ready — and yes, the coriander is on it.
### love_note (random, ≤ 2/week)
- Reminder: you're strong, you're lovely, and your sambar is legendary.
- Somewhere, a protein shake is crying because you chose real food. Proud of you.
- You make healthy look like an art form.
- If dedication were a dish, you'd be a full South Indian thali.

- You make ordinary weeknights feel like a festival. 💛
- If kindness were an ingredient, you'd be the whole spice box.
- Just a reminder that you're doing beautifully — on and off the plate.
- You bring warmth to every kitchen you walk into.
- Some people collect stamps. You collect good days. Keep going.
- The world needs more people who cook with love. Lucky world.
- Proud of you — not for the numbers, for showing up.
- You're the reason ordinary rasam tastes like home.
### empty_state
- No meals logged yet — the plate is clean and full of possibility.
- No friends here yet. Invite someone to share the snacks (and the leaderboard).

- Nothing here yet — a blank plate is just a meal waiting to happen.
- Quiet in here. Invite a friend and bring the snacks (and the competition).
- No messages yet. Little love notes will start arriving soon. 💌
### error_friendly
- Our AI chef dropped the ladle. Try again, or log it manually.
- The kitchen's a bit busy right now — manual entry works perfectly meanwhile.
- Too many recipe requests today! We'll be back tomorrow, fresher than idli batter.

- The AI chef stepped out for chai. A saved favourite is ready meanwhile.
- Hmm, the recipe genie needs a minute. Try again shortly.
- Kitchen's a little crowded right now — your saved recipes have your back.
### loading
- Stirring the pot…
- Grinding the masala…
- Asking the curry leaves for advice…
- Tempering mustard seeds… listen for the pop…
- Counting the protein, twice…
- Waiting for the pressure cooker's third whistle…
- Tasting for salt…
- Rolling out a fresh idea…
- Consulting the spice box…
- Flipping through grandma's recipe notebook…

### chosen
- Great choice! Your plate-photo reminder is set.
- Locked in. Good food, good choices, good you.
- Chosen! I'll nudge you for a plate photo after the meal.
- Excellent pick — the kitchen is already excited.
- Decision made. That's the hardest part done!
- Yes! That one's going to taste like a win.

### caring (safety mode — no jokes)
- We've noticed some very light days. Your body deserves fuel — if things feel hard, talking to a doctor or dietitian can really help. 💛
