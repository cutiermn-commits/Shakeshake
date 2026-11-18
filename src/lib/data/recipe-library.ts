/**
 * Built-in recipe library (DECISIONS D-031) — written by Claude (Claude Code session, 2026-11-18)
 * so meal suggestions keep working when the live AI provider is busy or down.
 *
 * Every recipe: 2 servings, ingredients in RAW grams for the whole recipe. NO nutrition numbers are
 * written here — scripts/build-recipe-library.mts computes them from the USDA FDC `foods` table
 * (CLAUDE.md C6) and refuses any recipe that isn't ≥ 70 % matched.
 * Ingredient names use the catalogue's names/aliases (src/lib/data/ingredients.ts).
 * Creative/culinary content: home-style approximations — review and adjust freely.
 */

type Region = "tamil" | "kerala" | "andhra" | "karnataka" | "telangana" | "mixed";
type Row = [title: string, region: Region, meal: "lunch" | "dinner", diet: "nonveg" | "egg" | "veg", minutes: number, ingredients: string, steps: string, tip: string, why: string];

export interface LibraryRecipe {
  title: string;
  region: Region;
  meal_type: "lunch" | "dinner";
  diet_type: "nonveg" | "egg" | "veg";
  servings: number;
  cook_minutes: number;
  ingredients: { name: string; grams: number; state: "raw" }[];
  steps: string[];
  protein_tip: string;
  why: string;
}

// prettier-ignore
const ROWS: Row[] = [
  // ───────────── LUNCH ─────────────
  ["Chettinad chicken curry with rice", "tamil", "lunch", "nonveg", 45,
    "chicken:400; onion:150; tomato:120; ginger:10; garlic:10; black pepper:4; fennel seeds:3; coriander powder:6; red chilli powder:4; turmeric powder:2; coconut:30; oil:15; curry leaves:2; salt:5; rice:150",
    "Rinse and cook the rice.|Dry-roast pepper, fennel and coconut; grind to a paste with a little water.|Heat oil, add curry leaves and onion; cook till golden.|Add ginger-garlic, tomato and the powders; cook till soft.|Add chicken and the paste, cover and simmer 20–25 min till cooked.",
    "Add a boiled egg on the side for about 6 g more protein.", "Chicken carries most of the protein; rice keeps it a proper meal."],
  ["Meen kuzhambu (seer fish curry) with rice", "tamil", "lunch", "nonveg", 35,
    "seer fish:350; shallot:100; tomato:120; tamarind:20; garlic:10; red chilli powder:5; coriander powder:8; turmeric powder:2; fenugreek seeds:2; mustard seeds:2; gingelly oil:15; curry leaves:2; salt:5; rice:150",
    "Soak tamarind in warm water and squeeze out the juice.|Heat gingelly oil; splutter mustard and fenugreek, add curry leaves, shallots and garlic.|Add tomato and the powders; cook 3 min.|Pour in tamarind water, simmer 8 min.|Slide in the fish and simmer gently 6–8 min. Serve with rice.",
    "Keep the fish pieces large so they stay juicy.", "Seer fish is lean and very high in protein."],
  ["Pepper chicken with toor dal rice", "tamil", "lunch", "nonveg", 40,
    "chicken breast:350; onion:120; black pepper:6; ginger:10; garlic:10; turmeric powder:2; oil:15; curry leaves:2; salt:5; rice:120; toor dal:50",
    "Pressure-cook rice and toor dal together with turmeric and salt.|Heat oil, add curry leaves and onion; sauté till soft.|Add ginger-garlic and the chicken; cook on high 5 min.|Add crushed pepper and salt, cover and cook till done.",
    "Dal in the rice adds plant protein on top of the chicken.", "Two protein sources on one plate."],
  ["Prawn thokku with rice", "tamil", "lunch", "nonveg", 30,
    "prawn:300; onion:120; tomato:150; garlic:10; ginger:8; red chilli powder:5; coriander powder:5; turmeric powder:2; oil:15; curry leaves:2; salt:5; rice:150",
    "Cook the rice.|Heat oil, add curry leaves and onion; sauté till golden.|Add ginger-garlic, tomato and powders; mash into a thick masala.|Add prawns and cook 5–6 min till curled and pink. Don't overcook.",
    "Swap half the rice for extra prawns on training days.", "Prawns are almost pure protein."],
  ["Kerala fish curry (meen curry) with red rice", "kerala", "lunch", "nonveg", 35,
    "tuna:350; shallot:80; tomato:100; ginger:10; garlic:10; green chilli:6; coconut milk:150; red chilli powder:5; turmeric powder:2; coconut oil:15; curry leaves:2; salt:5; red rice:140",
    "Cook the red rice.|Heat coconut oil; sauté shallots, ginger, garlic, green chilli and curry leaves.|Add tomato and powders; cook soft.|Pour in coconut milk and bring to a gentle simmer.|Add fish and cook 6–8 min without stirring hard.",
    "Red rice adds fibre; keep the coconut milk to one cup for balance.", "Fish plus red rice: protein and slow carbs."],
  ["Egg curry with rice", "tamil", "lunch", "egg", 30,
    "egg:240; onion:150; tomato:150; ginger:8; garlic:8; coriander powder:6; red chilli powder:4; turmeric powder:2; garam masala:2; oil:15; salt:5; rice:150",
    "Boil the eggs 9 min, cool and peel.|Heat oil and fry onion till golden.|Add ginger-garlic, tomato and powders; cook into a thick gravy with a little water.|Add the eggs (slit lightly) and simmer 5 min. Serve with rice.",
    "Add 2 extra egg whites to the gravy for a cheap protein boost.", "Two eggs each, simple and filling."],
  ["Mutton kuzhambu with rice", "tamil", "lunch", "nonveg", 60,
    "mutton:300; onion:150; tomato:120; ginger:10; garlic:10; coriander powder:8; red chilli powder:5; turmeric powder:2; fennel seeds:3; coconut:30; oil:15; salt:5; rice:150",
    "Pressure-cook mutton with turmeric, salt and water (5–6 whistles).|Grind coconut and fennel to a paste.|Heat oil, cook onion, ginger-garlic and tomato with the powders.|Add mutton with its stock and the paste; simmer 10 min.",
    "Goat meat is lean — keep the oil to one tablespoon.", "Slow-cooked comfort with solid protein."],
  ["Chicken keema with chapati", "mixed", "lunch", "nonveg", 30,
    "chicken mince:300; onion:120; tomato:100; green peas:80; ginger:8; garlic:8; garam masala:3; red chilli powder:4; turmeric powder:2; oil:12; salt:5; wheat flour:120",
    "Knead the wheat flour with water and rest 10 min; roll and cook 4 chapatis.|Heat oil, cook onion till soft, add ginger-garlic.|Add mince and break it up; cook till no longer pink.|Add tomato, peas and powders; cook dry. Finish with coriander leaves.",
    "Mince cooks fast and soaks up flavour — great for lunch boxes.", "Lean chicken mince plus peas."],
  ["Sambar with drumstick and steamed rice", "tamil", "lunch", "veg", 40,
    "toor dal:120; drumstick:100; brinjal:80; shallot:60; tomato:100; tamarind:15; sambar powder:12; turmeric powder:2; mustard seeds:2; oil:10; curry leaves:2; salt:5; rice:140; yogurt:200",
    "Pressure-cook toor dal with turmeric till soft; mash.|Boil the vegetables in tamarind water with sambar powder and salt.|Add the dal and simmer 5 min.|Temper mustard and curry leaves in oil and pour over.|Serve with rice and a bowl of yogurt.",
    "A full cup of dal plus yogurt makes this a proper protein lunch.", "Dal and yogurt pair for complete protein."],
  ["Rajma sundal bowl with millet", "mixed", "lunch", "veg", 30,
    "rajma:120; foxtail millet:120; onion:60; tomato:80; coconut:20; green chilli:5; mustard seeds:2; lemon:20; oil:10; curry leaves:2; salt:4",
    "Soak rajma overnight and pressure-cook till soft.|Cook the millet like rice (1:2.5 water).|Temper mustard, curry leaves and green chilli in oil; add onion and tomato.|Toss in rajma, coconut and salt; finish with lemon.",
    "Beans plus millet make a complete plant protein.", "High-fibre, high-protein vegetarian bowl."],
  ["Andhra chicken curry with rice", "andhra", "lunch", "nonveg", 40,
    "chicken:400; onion:150; tomato:100; ginger:10; garlic:10; red chilli powder:8; coriander powder:6; turmeric powder:2; garam masala:3; oil:15; salt:5; rice:150",
    "Cook the rice.|Heat oil, brown the onion well.|Add ginger-garlic, chilli and coriander powders; fry 1 min.|Add chicken and tomato, cover and cook 20 min, stirring.|Finish with garam masala.",
    "Ask for the spice your way — chilli doesn't change the protein!", "Fiery, simple and protein-packed."],
  ["Gongura chicken with rice", "andhra", "lunch", "nonveg", 40,
    "chicken:400; gongura:80; onion:120; garlic:10; green chilli:6; red chilli powder:4; turmeric powder:2; oil:15; salt:5; rice:150",
    "Sauté gongura leaves in a little oil till they melt; set aside.|Cook onion, garlic and green chilli in the remaining oil.|Add chicken, powders and salt; cover and cook 20 min.|Stir in the gongura and cook 5 min more.",
    "The tangy leaves mean you need less oil for flavour.", "Signature Andhra tang with lean chicken."],
  ["Tofu and green peas kurma with chapati", "mixed", "lunch", "veg", 30,
    "tofu:250; green peas:100; onion:100; tomato:100; coconut:30; cashew:10; ginger:8; garlic:8; garam masala:3; oil:12; salt:4; wheat flour:120",
    "Make 4 chapatis.|Grind coconut and cashew into a smooth paste.|Cook onion, ginger-garlic and tomato in oil; add the paste and a cup of water.|Add tofu cubes and peas; simmer 8 min.",
    "Firm tofu is the vegetarian swap for paneer here.", "Tofu and peas make a high-protein veg kurma."],
  ["Mackerel fry with lemon rice", "kerala", "lunch", "nonveg", 30,
    "indian mackerel:350; red chilli powder:6; turmeric powder:2; ginger:6; garlic:6; coconut oil:15; rice:150; lemon:30; peanuts:20; mustard seeds:2; curry leaves:2; salt:5",
    "Marinate the fish with chilli, turmeric, ginger-garlic and salt for 15 min.|Shallow-fry in coconut oil, 4 min per side.|Cook the rice; temper mustard, peanuts and curry leaves and toss into the rice with lemon juice.",
    "Mackerel is rich in protein and omega-3 fats.", "Crisp fish plus a tangy rice."],
  ["Chicken pulao with yogurt raita", "mixed", "lunch", "nonveg", 40,
    "chicken:300; rice:150; onion:100; tomato:80; ginger:8; garlic:8; garam masala:3; mint:10; ghee:10; oil:5; salt:5; yogurt:200; cucumber:100",
    "Brown the onion in ghee and oil; add ginger-garlic and chicken.|Add tomato, garam masala, mint and the rinsed rice.|Pour in water (1:2), cover and cook till done.|Mix yogurt with grated cucumber and salt for raita.",
    "The raita isn't just a side — it adds about 7 g protein.", "One-pot, protein-rich and family-friendly."],
  ["Moong dal kootu with rice and egg podimas", "tamil", "lunch", "egg", 35,
    "moong dal:100; cabbage:150; coconut:20; cumin seeds:2; egg:180; onion:60; green chilli:4; oil:12; mustard seeds:2; curry leaves:2; turmeric powder:2; salt:5; rice:130",
    "Cook moong dal with turmeric till soft; add chopped cabbage and cook 5 min.|Grind coconut and cumin; stir into the dal.|Scramble the eggs with onion and green chilli in a little oil (podimas).|Temper mustard and curry leaves over the kootu. Serve with rice.",
    "Podimas is the fastest protein add-on in a South Indian kitchen.", "Dal plus eggs, gentle and filling."],
  ["Crab masala with rice", "tamil", "lunch", "nonveg", 40,
    "crab:500; onion:120; tomato:120; ginger:8; garlic:10; black pepper:4; fennel seeds:2; coriander powder:6; red chilli powder:4; oil:15; curry leaves:2; salt:5; rice:150",
    "Clean the crab and crack the claws lightly.|Fry onion, curry leaves and ginger-garlic in oil.|Add tomato and powders; cook down.|Add crab with a little water, cover and cook 15 min. Finish with crushed pepper and fennel.",
    "Weight here is whole crab; the meat is very lean.", "A weekend treat that's still high-protein."],
  ["Chana masala with brown rice", "mixed", "lunch", "veg", 35,
    "chickpeas:130; brown rice:130; onion:120; tomato:150; ginger:8; garlic:8; coriander powder:5; red chilli powder:4; garam masala:3; oil:12; salt:5; yogurt:150",
    "Soak chickpeas overnight; pressure-cook till soft.|Cook brown rice.|Cook onion, ginger-garlic, tomato and powders in oil.|Add chickpeas with some cooking water; simmer 10 min. Serve with rice and yogurt.",
    "Add yogurt on the side for complete protein.", "Hearty, fibre-rich and protein-rich."],
  ["Karnataka chicken saaru with ragi mudde", "karnataka", "lunch", "nonveg", 45,
    "chicken:350; ragi flour:120; onion:100; tomato:100; coconut:30; garlic:10; ginger:8; coriander powder:6; red chilli powder:4; black pepper:3; oil:12; salt:5",
    "Cook chicken with onion, ginger-garlic, tomato and powders in oil, then add water for a thin curry (saaru).|Grind coconut with pepper and stir in; simmer 10 min.|For mudde: boil 250 ml water, add ragi flour, stir hard into a firm dough and shape into balls.",
    "Ragi brings calcium and fibre; the saaru brings the protein.", "Classic Karnataka pairing."],
  ["Egg and spinach thoran with rice", "kerala", "lunch", "egg", 25,
    "egg:240; spinach:200; coconut:30; shallot:50; green chilli:5; garlic:5; turmeric powder:1; coconut oil:12; mustard seeds:2; curry leaves:2; salt:4; rice:130",
    "Cook the rice.|Temper mustard and curry leaves in coconut oil; add shallots, garlic and chilli.|Add chopped spinach and cook till wilted.|Push aside, scramble in the eggs, then mix with grated coconut.",
    "Greens plus eggs: iron, folate and protein together.", "Quick Kerala-style stir-fry."],

  // ───────────── DINNER ─────────────
  ["Grilled chicken with sautéed vegetables", "mixed", "dinner", "nonveg", 30,
    "chicken breast:350; capsicum:120; carrot:100; beans:100; garlic:8; black pepper:3; lemon:20; olive oil:12; salt:4",
    "Marinate chicken with lemon, garlic, pepper and salt.|Grill or pan-sear 6–7 min per side.|Sauté the vegetables in the remaining oil with garlic. Slice the chicken over the top.",
    "No rice tonight keeps dinner light but high-protein.", "Lean, light and very high in protein."],
  ["Tawa seer fish fry with beans poriyal", "tamil", "dinner", "nonveg", 30,
    "seer fish:350; red chilli powder:6; turmeric powder:2; ginger:6; garlic:6; lemon:15; oil:15; beans:200; coconut:20; mustard seeds:2; urad dal:5; curry leaves:2; salt:5",
    "Marinate fish with powders, ginger-garlic, lemon and salt for 15 min.|Shallow-fry on a hot tawa, 3–4 min per side.|For poriyal: temper mustard, urad dal and curry leaves; add chopped beans and cook; toss with coconut.",
    "Fish plus a vegetable side makes an easy low-carb dinner.", "Crisp, lean and protein-rich."],
  ["Pesarattu with ginger chutney", "andhra", "dinner", "veg", 30,
    "green gram:150; rice:30; ginger:15; green chilli:6; onion:60; cumin seeds:2; oil:15; tamarind:5; jaggery:5; salt:4",
    "Soak green gram and rice 4–6 hours; grind with ginger, chilli and cumin to a batter.|Spread thin on a hot tawa, sprinkle onion, drizzle oil and cook till crisp.|For chutney: grind ginger with tamarind, jaggery and salt.",
    "Have 3 pesarattu with a glass of buttermilk for more protein.", "Whole green gram dosa — protein in every bite."],
  ["Adai (mixed dal dosa) with avial", "tamil", "dinner", "veg", 40,
    "chana dal:50; toor dal:50; urad dal:30; moong dal:30; idli rice:60; dry red chilli:4; ginger:8; onion:60; oil:15; carrot:80; beans:80; yogurt:100; coconut:30; salt:5",
    "Soak the dals and rice 3 hours; grind coarsely with chilli and ginger.|Make thick dosas with onion, cooking with a little oil.|For avial: cook carrot and beans, then stir in coconut ground with yogurt.",
    "Four dals together give a fuller amino-acid mix.", "Multi-dal dosa, the protein star of tiffin."],
  ["Egg podimas with chapati", "tamil", "dinner", "egg", 20,
    "egg:240; egg white:100; onion:100; tomato:80; green chilli:5; turmeric powder:1; black pepper:2; oil:10; wheat flour:100; salt:4",
    "Make 3–4 chapatis.|Sauté onion, green chilli and tomato in oil.|Add beaten eggs and whites with turmeric, salt and pepper; scramble softly.",
    "Extra whites raise protein without much fat.", "15-minute dinner with serious protein."],
  ["Chicken sukka with cucumber salad", "karnataka", "dinner", "nonveg", 35,
    "chicken:400; onion:120; coconut:40; dry red chilli:5; coriander powder:6; black pepper:3; garlic:10; ghee:10; oil:5; cucumber:150; lemon:15; salt:5",
    "Dry-roast coconut, red chillies, coriander and pepper; grind coarsely.|Cook onion and garlic in ghee and oil.|Add chicken and cook covered 15 min.|Add the masala and roast dry till coated. Serve with a lemony cucumber salad.",
    "A dry dish means no rice is needed.", "Mangalorean-style dry chicken, low-carb dinner."],
  ["Prawn and vegetable stir-fry", "mixed", "dinner", "nonveg", 20,
    "prawn:300; broccoli:150; capsicum:100; carrot:80; garlic:8; ginger:8; soy sauce:15; black pepper:2; oil:12; salt:3",
    "Heat oil till very hot; add garlic and ginger.|Add prawns and cook 2 min.|Add vegetables and stir-fry 3–4 min.|Finish with soy sauce and pepper.",
    "Ready in 20 minutes with almost 40 g protein each.", "Fast, fresh and high-protein."],
  ["Moong dal cheela with mint chutney", "mixed", "dinner", "veg", 25,
    "moong dal:150; onion:60; tomato:60; green chilli:5; ginger:8; oil:12; mint:20; coriander leaves:20; yogurt:150; salt:4",
    "Soak moong dal 3 hours and grind smooth with ginger and chilli.|Stir in chopped onion and tomato.|Cook thin pancakes on a greased tawa.|Blend mint, coriander and yogurt for the chutney.",
    "Yogurt chutney adds extra protein to every bite.", "Light dal pancakes for a quick dinner."],
  ["Mutton pepper fry with salad", "tamil", "dinner", "nonveg", 60,
    "mutton:300; onion:120; black pepper:6; fennel seeds:3; ginger:10; garlic:10; turmeric powder:2; oil:15; curry leaves:2; cucumber:120; tomato:80; salt:5",
    "Pressure-cook mutton with turmeric and salt.|Fry onion, curry leaves and ginger-garlic in oil.|Add mutton and cook till the water dries.|Add crushed pepper and fennel; roast till dark. Serve with a cucumber-tomato salad.",
    "A dry fry needs little or no rice.", "Rich flavour, lean protein."],
  ["Kerala egg roast with appam-style rice pancakes", "kerala", "dinner", "egg", 35,
    "egg:240; onion:200; tomato:100; ginger:8; garlic:8; red chilli powder:5; coriander powder:4; garam masala:2; coconut oil:15; rice flour:100; coconut milk:80; salt:5",
    "Boil and peel the eggs.|Cook onion slowly in coconut oil till deep golden.|Add ginger-garlic, tomato and powders; roast.|Add eggs and coat well.|For quick pancakes: whisk rice flour with coconut milk and water; cook thin on a covered pan.",
    "Have three eggs if it's a training day.", "Kerala comfort food built around eggs."],
  ["Chicken soup with millet", "mixed", "dinner", "nonveg", 35,
    "chicken:300; foxtail millet:60; carrot:80; beans:60; onion:60; garlic:8; ginger:8; black pepper:3; ghee:8; salt:4",
    "Sauté onion, ginger and garlic in ghee.|Add chicken, vegetables, millet and 1 litre water.|Simmer 25 min till the millet is soft. Finish with pepper.",
    "Soup dinners are great after a hard workout.", "Warm, light and protein-rich."],
  ["Tofu bhurji with chapati", "mixed", "dinner", "veg", 20,
    "tofu:300; onion:100; tomato:100; capsicum:60; green chilli:5; turmeric powder:2; garam masala:2; oil:12; wheat flour:100; salt:4",
    "Make 3–4 chapatis.|Sauté onion, chilli, capsicum and tomato in oil.|Crumble in the tofu with turmeric, garam masala and salt; cook 5 min.",
    "Crumbled firm tofu works like paneer bhurji.", "Quick vegetarian scramble."],
  ["Anchovy (nethili) fry with keerai kootu", "tamil", "dinner", "nonveg", 35,
    "anchovy:300; red chilli powder:6; turmeric powder:2; rice flour:15; oil:15; spinach:200; moong dal:60; coconut:20; cumin seeds:2; salt:5",
    "Coat cleaned anchovies with chilli, turmeric, rice flour and salt; shallow-fry till crisp.|Cook moong dal till soft, add chopped spinach and cook 5 min.|Stir in coconut ground with cumin.",
    "Tiny fish, big protein — and calcium too.", "Crisp nethili with greens and dal."],
  ["Chicken tikka-style skewers with mint yogurt", "mixed", "dinner", "nonveg", 40,
    "chicken breast:350; yogurt:150; ginger:8; garlic:8; red chilli powder:4; garam masala:3; lemon:15; onion:100; capsicum:100; oil:10; mint:15; salt:5",
    "Marinate chicken in half the yogurt with spices, lemon and salt for 30 min.|Thread with onion and capsicum; grill or pan-roast 12–15 min.|Blend the rest of the yogurt with mint for the dip.",
    "Yogurt marinade keeps lean breast juicy.", "Restaurant flavour, home-light."],
  ["Masoor dal with jeera rice and egg", "mixed", "dinner", "egg", 30,
    "masoor dal:120; onion:80; tomato:100; garlic:8; cumin seeds:3; turmeric powder:2; ghee:10; rice:120; egg:120; salt:5",
    "Pressure-cook masoor dal with tomato and turmeric.|Temper cumin and garlic in ghee and pour over.|Cook rice with cumin.|Boil the eggs and serve one each on top.",
    "One egg each turns a simple dal into a high-protein dinner.", "Comforting dal, boosted."],
  ["Squid (kanava) roast with salad", "kerala", "dinner", "nonveg", 35,
    "squid:350; turmeric powder:2; onion:150; tomato:80; ginger:8; garlic:10; red chilli powder:5; black pepper:3; coconut oil:15; curry leaves:2; cucumber:120; salt:5",
    "Cook cleaned squid rings with salt and turmeric for 10 min.|Roast onion, ginger-garlic and curry leaves in coconut oil till brown.|Add tomato and powders, then the squid; roast till dry. Serve with cucumber.",
    "Squid is very lean — this is one of the highest-protein dinners here.", "Kerala-style roast, low-carb."],
  ["Sprouts sundal and vegetable soup", "tamil", "dinner", "veg", 20,
    "mung sprouts:250; chickpeas:120; yogurt:200; coconut:20; green chilli:4; mustard seeds:2; curry leaves:2; lemon:15; carrot:80; cabbage:100; tomato:80; garlic:6; oil:10; salt:4",
    "Pressure-cook soaked chickpeas; steam the sprouts 5 min.|Temper mustard, chilli and curry leaves; toss with sprouts, chickpeas, coconut and lemon.|Simmer carrot, cabbage, tomato and garlic in water for a quick soup. Serve with a bowl of yogurt.",
    "Yogurt on the side lifts this to a proper protein dinner.", "Light, plant-protein dinner."],
  ["Chicken kothu-style chapati", "tamil", "dinner", "nonveg", 30,
    "chicken breast:250; egg:120; wheat flour:120; onion:100; tomato:80; capsicum:60; green chilli:5; garam masala:3; oil:15; curry leaves:2; salt:5",
    "Make chapatis and shred them into strips.|Cook onion, chilli, curry leaves, tomato and capsicum in oil.|Add diced chicken and cook through; push aside and scramble the eggs.|Toss in the chapati strips with garam masala, chopping with the spatula.",
    "A smart way to turn leftover chapatis into a protein meal.", "Street-food fun at home."],
  ["Telangana egg pulusu with rice", "telangana", "dinner", "egg", 30,
    "egg:240; onion:120; tomato:100; tamarind:15; red chilli powder:5; coriander powder:4; turmeric powder:2; jaggery:5; oil:15; curry leaves:2; salt:5; rice:120",
    "Boil and peel the eggs; fry them lightly in a little oil.|Cook onion and tomato with the powders.|Add tamarind water and jaggery; simmer 10 min.|Add the eggs and simmer 5 min. Serve with rice.",
    "Eggs soak up the tangy pulusu beautifully.", "Tangy, spicy and protein-rich."],
  ["Garlic pepper tuna with sautéed greens", "mixed", "dinner", "nonveg", 20,
    "tuna:350; garlic:12; black pepper:4; lemon:20; olive oil:12; spinach:200; amaranth leaves:100; salt:4",
    "Season tuna steaks with pepper, salt and lemon.|Sear in hot oil 2–3 min per side.|Sauté garlic and greens in the same pan till wilted.",
    "About 40 g protein in a 20-minute dinner.", "Clean, fast and high-protein."],
];

function parseIngredients(s: string): { name: string; grams: number; state: "raw" }[] {
  return s.split(";").map((p) => {
    const [name, g] = p.split(":").map((x) => x.trim());
    const grams = Number(g);
    if (!name || !(grams > 0)) throw new Error(`bad ingredient "${p}"`);
    return { name, grams, state: "raw" as const };
  });
}

export const RECIPE_LIBRARY: LibraryRecipe[] = ROWS.map(([title, region, meal_type, diet_type, cook_minutes, ings, steps, protein_tip, why]) => ({
  title,
  region,
  meal_type,
  diet_type,
  servings: 2,
  cook_minutes,
  ingredients: parseIngredients(ings),
  steps: steps.split("|").map((s) => s.trim()),
  protein_tip,
  why,
}));
