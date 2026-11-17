/**
 * Curated South Indian ingredient catalogue (BACKLOG M2-01).
 *
 * Contains ONLY names, aliases, aisle, staple flag and the search query used to find the
 * matching USDA FoodData Central (CC0) record. It deliberately contains NO nutrition values:
 * those are imported from FDC by `scripts/import-fdc.ts` into the `foods` table, so every
 * number shown in the app is traceable to FDC (CLAUDE.md C6).
 *
 * Aliases (Tamil/Malayalam/Telugu/Kannada/Hindi transliterations) are best-effort spellings —
 * ASSUMPTION: review with a native speaker; extend freely.
 */

export type Aisle =
  | "meat_fish"
  | "eggs_dairy"
  | "pulses"
  | "grains"
  | "vegetables"
  | "greens_herbs"
  | "fruit"
  | "nuts_seeds"
  | "spices"
  | "oils"
  | "other";

export interface CatalogItem {
  key: string;
  name: string;
  aliases: string[];
  aisle: Aisle;
  staple?: boolean;
  /** Query used against FDC search (Foundation / SR Legacy, raw). Reviewed by a human after import. */
  fdcQuery: string;
  /** Approximate grams per piece, for shoppable units (ASSUMPTION). */
  gramsPerPiece?: number;
}

type Row = [key: string, name: string, aliases: string, aisle: Aisle, fdcQuery: string, opts?: { staple?: boolean; piece?: number }];

// prettier-ignore
const ROWS: Row[] = [
  // ── Meat & fish ───────────────────────────────────────────────
  ["chicken_breast", "Chicken breast", "chicken breast boneless|kozhi breast", "meat_fish", "chicken breast meat only raw"],
  ["chicken_thigh", "Chicken thigh", "chicken leg|kozhi", "meat_fish", "chicken thigh meat only raw"],
  ["chicken", "Chicken (curry cut)", "chicken curry cut|kozhi|koli|kodi|murgh", "meat_fish", "chicken broilers or fryers meat only raw"],
  ["chicken_mince", "Chicken mince", "chicken keema|minced chicken", "meat_fish", "ground chicken raw"],
  ["mutton", "Mutton (goat)", "goat meat|aattu kari|mamsam|gosht|lamb", "meat_fish", "goat raw"],
  ["mutton_mince", "Mutton mince", "keema|kheema|minced mutton|kothu kari", "meat_fish", "lamb ground raw"],
  ["seer_fish", "Seer fish", "vanjaram|king mackerel|neymeen|surmai|anjal", "meat_fish", "fish mackerel king raw"],
  ["mackerel", "Indian mackerel", "ayala|ayila|bangda|kanangeluthi", "meat_fish", "fish mackerel atlantic raw"],
  ["sardine", "Sardine", "mathi|chaala|mathi meen|tarlee", "meat_fish", "fish sardine raw"],
  ["anchovy", "Anchovy", "nethili|natholi|kozhuva|anchovies", "meat_fish", "fish anchovy european raw"],
  ["pomfret", "Pomfret", "vavval|avoli|paplet", "meat_fish", "fish pompano florida raw"],
  ["tuna", "Tuna", "choora|soorai|kera", "meat_fish", "fish tuna fresh yellowfin raw"],
  ["salmon", "Indian salmon", "kaala|rawas|salmon", "meat_fish", "fish salmon atlantic wild raw"],
  ["tilapia", "Tilapia", "jilebi meen|tilapia fish", "meat_fish", "fish tilapia raw"],
  ["rohu", "Rohu / carp", "rohu|carp|kendai", "meat_fish", "fish carp raw"],
  ["prawn", "Prawns", "prawn|shrimp|eral|chemmeen|royyalu|jhinga", "meat_fish", "crustaceans shrimp raw"],
  ["crab", "Crab", "nandu|njandu|peetha|crab meat", "meat_fish", "crustaceans crab blue raw"],
  ["squid", "Squid", "kanava|koonthal|calamari", "meat_fish", "mollusks squid mixed species raw"],
  ["mussel", "Mussels", "kallummakkaya|kadal kai", "meat_fish", "mollusks mussel blue raw"],
  ["clam", "Clams", "kakka|matti", "meat_fish", "mollusks clam mixed species raw"],
  ["chicken_liver", "Chicken liver", "kozhi eeral", "meat_fish", "chicken liver all classes raw"],
  // ── Eggs & dairy ──────────────────────────────────────────────
  ["egg", "Egg (whole)", "eggs|muttai|mutta|guddu|motte|anda", "eggs_dairy", "egg whole raw fresh", { piece: 50 }],
  ["egg_white", "Egg white", "egg whites|muttai vellai", "eggs_dairy", "egg white raw fresh", { piece: 33 }],
  ["milk", "Milk (toned)", "paal|palu|haalu|doodh|toned milk", "eggs_dairy", "milk reduced fat fluid 2%"],
  ["whole_milk", "Whole milk", "full cream milk", "eggs_dairy", "milk whole 3.25% milkfat"],
  ["curd", "Curd / plain yoghurt", "thayir|thairu|perugu|mosaru|dahi|yogurt|yoghurt", "eggs_dairy", "yogurt plain whole milk"],
  ["greek_yogurt", "Greek yoghurt / hung curd", "hung curd|greek yogurt", "eggs_dairy", "yogurt greek plain nonfat"],
  ["buttermilk", "Buttermilk", "mor|moru|majjiga|majjige|chaas", "eggs_dairy", "buttermilk fluid cultured lowfat"],
  ["paneer", "Paneer", "cottage cheese indian|panir", "eggs_dairy", "cheese paneer"],
  ["cheese", "Cheese", "processed cheese|cheddar", "eggs_dairy", "cheese cheddar"],
  ["ghee", "Ghee", "nei|neyyi|tuppa|clarified butter", "oils", "butter oil anhydrous", { staple: true }],
  ["butter", "Butter", "vennai|venna|benne|makhan", "eggs_dairy", "butter salted"],
  ["cream", "Fresh cream", "malai|cream", "eggs_dairy", "cream fluid heavy whipping"],
  ["whey", "Whey protein (unflavoured)", "whey protein", "eggs_dairy", "beverages whey protein powder isolate"],
  // ── Pulses & soy ──────────────────────────────────────────────
  ["toor_dal", "Toor dal", "tuvaram paruppu|thuvaram paruppu|kandi pappu|togari bele|arhar|pigeon pea", "pulses", "pigeon peas red gram mature seeds raw"],
  ["moong_dal", "Moong dal (split)", "pasi paruppu|payatham parippu|pesara pappu|hesaru bele|split green gram", "pulses", "mung beans mature seeds raw"],
  ["green_gram", "Green gram (whole)", "pachai payaru|cherupayar|pesalu|hesaru kalu|whole moong|mung bean", "pulses", "mung beans mature seeds raw"],
  ["urad_dal", "Urad dal", "ulundu|uzhunnu|minapa pappu|uddina bele|black gram", "pulses", "mungo beans mature seeds raw"],
  ["chana_dal", "Chana dal", "kadalai paruppu|kadala parippu|senaga pappu|kadale bele|bengal gram", "pulses", "chickpeas garbanzo beans bengal gram mature seeds raw"],
  ["chickpea", "Chickpeas (kabuli)", "vellai kondakadalai|kabuli chana|garbanzo|chole", "pulses", "chickpeas garbanzo beans mature seeds raw"],
  ["black_chana", "Black chana", "karuppu kondakadalai|kala chana|kadala", "pulses", "chickpeas garbanzo beans mature seeds raw"],
  ["masoor_dal", "Masoor dal", "red lentil|mysore paruppu|masoor", "pulses", "lentils pink or red raw"],
  ["horse_gram", "Horse gram", "kollu|muthira|ulavalu|hurali", "pulses", "horse gram"],
  ["rajma", "Rajma (kidney beans)", "kidney beans|rajmah", "pulses", "beans kidney red mature seeds raw"],
  ["cowpea", "Cowpea / lobia", "karamani|vanpayar|alasandalu|alasande|black eyed peas", "pulses", "cowpeas common mature seeds raw"],
  ["peas_dried", "Dried peas", "pattani|dried green peas|white peas", "pulses", "peas split mature seeds raw"],
  ["soy_chunks", "Soya chunks", "meal maker|soya chunks|nutrela|soy chunks", "pulses", "soy flour defatted"],
  ["tofu", "Tofu", "soya paneer|bean curd", "pulses", "tofu raw firm prepared with calcium sulfate"],
  ["edamame", "Edamame", "green soybeans", "pulses", "edamame frozen prepared"],
  ["sprouts", "Mung sprouts", "mulai payaru|sprouted moong|bean sprouts", "pulses", "mung beans mature seeds sprouted raw"],
  // ── Grains & millets ─────────────────────────────────────────
  ["rice_raw", "Rice (white, raw)", "arisi|ari|biyyam|akki|chawal|white rice|sona masoori|ponni rice", "grains", "rice white long-grain regular raw unenriched", { staple: true }],
  ["rice_brown", "Brown rice", "brown rice|kaikuthal arisi", "grains", "rice brown long-grain raw"],
  ["rice_red", "Red rice (matta)", "matta rice|rosematta|kerala red rice|sigappu arisi", "grains", "rice brown medium-grain raw"],
  ["idli_rice", "Idli rice (parboiled)", "puzhungal arisi|parboiled rice|idli arisi", "grains", "rice white long-grain parboiled enriched dry"],
  ["poha", "Poha / aval", "aval|avalakki|atukulu|flattened rice|beaten rice", "grains", "rice flakes"],
  ["ragi", "Ragi flour", "kezhvaragu|keppai|ragi|finger millet|nachni|ragulu", "grains", "millet flour"],
  ["foxtail_millet", "Foxtail millet", "thinai|kangni|korra|navane", "grains", "millet raw"],
  ["little_millet", "Little millet", "samai|sama|saame|kutki", "grains", "millet raw"],
  ["kodo_millet", "Kodo millet", "varagu|arikelu|harka", "grains", "millet raw"],
  ["barnyard_millet", "Barnyard millet", "kuthiraivali|udalu|oodalu|sanwa", "grains", "millet raw"],
  ["jowar", "Jowar (sorghum)", "cholam|jonna|jola|sorghum", "grains", "sorghum grain"],
  ["bajra", "Bajra (pearl millet)", "kambu|sajjalu|sajje|pearl millet", "grains", "millet raw"],
  ["oats", "Rolled oats", "oats|oatmeal", "grains", "cereals oats regular and quick not fortified dry"],
  ["wheat_flour", "Wheat flour (atta)", "atta|godhumai maavu|whole wheat flour|chapati flour", "grains", "wheat flour whole-grain"],
  ["maida", "Maida (refined flour)", "all purpose flour|maida maavu", "grains", "wheat flour white all-purpose unenriched"],
  ["rava", "Rava / sooji", "sooji|semolina|ravai|upma rava|bombay rava", "grains", "semolina unenriched"],
  ["broken_wheat", "Broken wheat", "godhumai ravai|dalia|cracked wheat", "grains", "bulgur dry"],
  ["vermicelli", "Vermicelli", "semiya|sevai|shavige", "grains", "pasta dry unenriched"],
  ["quinoa", "Quinoa", "quinoa", "grains", "quinoa uncooked"],
  ["rice_flour", "Rice flour", "arisi maavu|ari podi|biyyam pindi", "grains", "rice flour white unenriched"],
  ["besan", "Besan (gram flour)", "kadalai maavu|chickpea flour|gram flour|senaga pindi", "grains", "chickpea flour besan"],
  // ── Vegetables ───────────────────────────────────────────────
  ["onion", "Onion", "vengayam|ulli|ullipaya|eerulli|pyaz|big onion", "vegetables", "onions raw", { staple: true, piece: 110 }],
  ["shallot", "Shallots (small onion)", "chinna vengayam|sambar onion|kunjulli|small onion", "vegetables", "shallots raw"],
  ["tomato", "Tomato", "thakkali|thakkali pazham|tamata|tomatoes", "vegetables", "tomatoes red ripe raw year round average", { piece: 100 }],
  ["potato", "Potato", "urulai kizhangu|urulakizhangu|bangaladumpa|aloo|potatoes", "vegetables", "potatoes flesh and skin raw", { piece: 150 }],
  ["sweet_potato", "Sweet potato", "sakkaraivalli kizhangu|madhura kizhangu|shakarkand", "vegetables", "sweet potato raw unprepared"],
  ["carrot", "Carrot", "carrot|gajar", "vegetables", "carrots raw", { piece: 60 }],
  ["beans", "French beans", "beans|green beans|payaru|beans kai", "vegetables", "beans snap green raw"],
  ["cabbage", "Cabbage", "muttaikose|cabbage|kosu|patta gobhi", "vegetables", "cabbage raw"],
  ["cauliflower", "Cauliflower", "gobi|phool gobhi|cauliflower", "vegetables", "cauliflower raw"],
  ["broccoli", "Broccoli", "broccoli", "vegetables", "broccoli raw"],
  ["capsicum", "Capsicum", "kudai milagai|bell pepper|shimla mirch", "vegetables", "peppers sweet green raw", { piece: 120 }],
  ["brinjal", "Brinjal", "kathirikai|vazhuthananga|vankaya|badanekayi|eggplant|baingan", "vegetables", "eggplant raw"],
  ["okra", "Okra / ladies finger", "vendakkai|venda|bendakaya|bende|bhindi|ladies finger", "vegetables", "okra raw"],
  ["drumstick", "Drumstick", "murungakkai|muringakka|munagakaya|nugge|moringa pods", "vegetables", "drumstick pods"],
  ["bottle_gourd", "Bottle gourd", "suraikkai|churakka|sorakaya|sorekai|lauki", "vegetables", "gourd white-flowered calabash raw"],
  ["ridge_gourd", "Ridge gourd", "peerkangai|peechinga|beerakaya|heerekai|turai", "vegetables", "gourd dishcloth towelgourd raw"],
  ["snake_gourd", "Snake gourd", "pudalangai|padavalanga|potlakaya|padavalakai", "vegetables", "gourd snake"],
  ["bitter_gourd", "Bitter gourd", "pavakkai|kaypakka|kakarakaya|hagalakai|karela", "vegetables", "balsam-pear bitter gourd pods raw"],
  ["ash_gourd", "Ash gourd", "poosanikai|kumbalanga|boodida gummadi|white pumpkin", "vegetables", "waxgourd chinese preserving melon raw"],
  ["pumpkin", "Pumpkin (yellow)", "parangikai|mathanga|gummadikaya|kumbalakayi", "vegetables", "pumpkin raw"],
  ["chow_chow", "Chayote (chow chow)", "chow chow|seemai kathirikai|bangalore kathirikai", "vegetables", "chayote fruit raw"],
  ["raw_banana", "Raw banana (plantain)", "vazhakkai|pachakaya|aratikaya|baale kayi|plantain", "vegetables", "plantains green raw"],
  ["banana_flower", "Banana flower", "vazhaipoo|vazhakoombu|arati puvvu", "vegetables", "banana flower"],
  ["banana_stem", "Banana stem", "vazhaithandu|unnithandu", "vegetables", "banana stem"],
  ["yam", "Elephant yam", "senai kizhangu|chena|kanda gadda|suran", "vegetables", "yam raw"],
  ["colocasia", "Colocasia (arbi)", "seppankizhangu|chembu|chamadumpa|arbi|taro", "vegetables", "taro raw"],
  ["beetroot", "Beetroot", "beetroot|beets|chukandar", "vegetables", "beets raw", { piece: 100 }],
  ["radish", "Radish", "mullangi|mullangi|moolangi|mooli", "vegetables", "radishes oriental raw"],
  ["cucumber", "Cucumber", "vellarikkai|kakkiri|dosakaya|southekayi|kheera", "vegetables", "cucumber with peel raw"],
  ["green_peas", "Green peas (fresh/frozen)", "pachai pattani|matar|green peas", "vegetables", "peas green raw"],
  ["mushroom", "Mushroom", "kaalan|koon|puttagodugulu|mushrooms", "vegetables", "mushrooms white raw"],
  ["corn", "Sweet corn", "makka cholam|sweet corn|bhutta", "vegetables", "corn sweet yellow raw"],
  ["baby_corn", "Baby corn", "baby corn", "vegetables", "corn sweet yellow raw"],
  ["avarakkai", "Broad beans (avarai)", "avarakkai|amarakka|chikkudukaya|avarekai|flat beans|sem", "vegetables", "hyacinth beans immature seeds raw"],
  ["cluster_beans", "Cluster beans", "kothavarangai|kothavara|goruchikkudu|gawar", "vegetables", "cluster beans"],
  ["raw_mango", "Raw mango", "mangai|pacha manga|mamidikaya|kairi", "vegetables", "mangos raw"],
  ["lemon", "Lemon", "elumichai|cherunaranga|nimmakaya|nimbe|nimbu", "vegetables", "lemon juice raw", { staple: true, piece: 50 }],
  ["green_chilli", "Green chilli", "pachai milagai|pacha mulaku|pachi mirchi|hasi menasinakai|hari mirch", "vegetables", "peppers hot chili green raw", { staple: true, piece: 5 }],
  ["ginger", "Ginger", "inji|inchi|allam|shunti|adrak", "vegetables", "ginger root raw", { staple: true }],
  ["garlic", "Garlic", "poondu|veluthulli|vellulli|bellulli|lahsun", "vegetables", "garlic raw", { staple: true }],
  ["coconut", "Coconut (fresh, grated)", "thengai|thenga|kobbari|tenginakayi|nariyal|grated coconut", "vegetables", "nuts coconut meat raw"],
  ["coconut_milk", "Coconut milk", "thengai paal|thenga paal|kobbari palu", "vegetables", "nuts coconut milk raw liquid expressed from grated meat and water"],
  ["desiccated_coconut", "Desiccated coconut", "copra|dry coconut|kopra", "vegetables", "nuts coconut meat dried desiccated not sweetened"],
  // ── Greens & herbs ───────────────────────────────────────────
  ["spinach", "Spinach / palak", "pasalai keerai|palak|cheera|palakura|spinach", "greens_herbs", "spinach raw"],
  ["amaranth", "Amaranth leaves", "mulai keerai|arai keerai|cheera|thotakura|harive soppu|chaulai", "greens_herbs", "amaranth leaves raw"],
  ["moringa_leaves", "Drumstick leaves", "murungai keerai|muringayila|munaga aaku|nugge soppu|moringa leaves", "greens_herbs", "drumstick leaves raw"],
  ["fenugreek_leaves", "Fenugreek leaves", "vendhaya keerai|uluva ila|menthi kura|menthya soppu|methi", "greens_herbs", "fenugreek leaves"],
  ["gongura", "Gongura (sorrel leaves)", "pulicha keerai|gongura|pundi soppu", "greens_herbs", "roselle raw"],
  ["curry_leaves", "Curry leaves", "kariveppilai|kariveppila|karivepaku|karibevu|kadi patta", "greens_herbs", "curry leaves", { staple: true }],
  ["coriander_leaves", "Coriander leaves", "kothamalli|malli ila|kothimeera|kottambari soppu|dhania patta|cilantro", "greens_herbs", "coriander cilantro leaves raw", { staple: true }],
  ["mint", "Mint", "pudina|puthina|mint leaves", "greens_herbs", "spearmint fresh"],
  ["spring_onion", "Spring onion", "spring onion|scallion|green onion", "greens_herbs", "onions spring or scallions raw"],
  ["lettuce", "Lettuce", "lettuce", "greens_herbs", "lettuce green leaf raw"],
  // ── Fruit ────────────────────────────────────────────────────
  ["banana", "Banana", "vazhaipazham|pazham|aratipandu|baale hannu|kela", "fruit", "bananas raw", { piece: 120 }],
  ["apple", "Apple", "apple|seb", "fruit", "apples raw with skin", { piece: 180 }],
  ["guava", "Guava", "koyya|pera|jama|seebe|amrood", "fruit", "guavas common raw", { piece: 100 }],
  ["papaya", "Papaya", "pappali|omakka|boppayi|parangi", "fruit", "papayas raw"],
  ["mango", "Mango (ripe)", "maambazham|manga|mamidi pandu|aam", "fruit", "mangos raw"],
  ["pomegranate", "Pomegranate", "maadhulai|mathalam|danimma|anar", "fruit", "pomegranates raw"],
  ["orange", "Orange", "orange|santra|kamala", "fruit", "oranges raw all commercial varieties", { piece: 130 }],
  ["tamarind", "Tamarind", "puli|chintapandu|hunase|imli", "fruit", "tamarinds raw", { staple: true }],
  ["dates", "Dates", "pericham pazham|eenthapazham|kharjura", "fruit", "dates medjool"],
  // ── Nuts & seeds ─────────────────────────────────────────────
  ["peanut", "Peanuts", "verkadalai|nilakadala|kappalandi|palli|shenga|kadalekai|groundnut|moongphali", "nuts_seeds", "peanuts all types raw"],
  ["cashew", "Cashew", "mundhiri|andiparippu|jeedipappu|godambi|kaju", "nuts_seeds", "nuts cashew nuts raw"],
  ["almond", "Almonds", "badam|almond", "nuts_seeds", "nuts almonds"],
  ["walnut", "Walnuts", "akhrot|walnut", "nuts_seeds", "nuts walnuts english"],
  ["sesame", "Sesame seeds", "ellu|ellu vithu|nuvvulu|yellu|til|gingelly seeds", "nuts_seeds", "seeds sesame seeds whole dried"],
  ["flaxseed", "Flaxseed", "ali vithai|cheruchana vithu|avise ginjalu|agase|alsi|flax seeds|linseed", "nuts_seeds", "seeds flaxseed"],
  ["chia", "Chia seeds", "chia", "nuts_seeds", "seeds chia seeds dried"],
  ["pumpkin_seeds", "Pumpkin seeds", "pumpkin seeds|pepitas", "nuts_seeds", "seeds pumpkin and squash seed kernels dried"],
  ["sunflower_seeds", "Sunflower seeds", "sunflower seeds", "nuts_seeds", "seeds sunflower seed kernels dried"],
  ["roasted_gram", "Roasted gram (pottukadalai)", "pottukadalai|pottukadala|putnalu|hurigadale|dalia|roasted chana", "nuts_seeds", "chickpeas garbanzo beans mature seeds raw"],
  // ── Spices & condiments ─────────────────────────────────────
  ["salt", "Salt", "uppu|uppu podi|namak", "spices", "salt table", { staple: true }],
  ["turmeric", "Turmeric powder", "manjal|manjal podi|pasupu|arishina|haldi", "spices", "spices turmeric ground", { staple: true }],
  ["chilli_powder", "Red chilli powder", "milagai thool|mulaku podi|karam|menasina pudi|lal mirch", "spices", "spices chili powder", { staple: true }],
  ["dry_red_chilli", "Dry red chilli", "vara milagai|kanthari|endu mirapakaya|byadagi|kashmiri chilli", "spices", "peppers hot chile sun-dried", { staple: true }],
  ["coriander_powder", "Coriander powder", "malli thool|malli podi|dhaniyalu podi|dhania powder", "spices", "spices coriander seed", { staple: true }],
  ["cumin", "Cumin seeds", "jeeragam|jeerakam|jeelakarra|jeerige|jeera", "spices", "spices cumin seed", { staple: true }],
  ["mustard_seeds", "Mustard seeds", "kadugu|kaduku|aavalu|sasive|rai", "spices", "spices mustard seed ground", { staple: true }],
  ["fenugreek_seeds", "Fenugreek seeds", "vendhayam|uluva|menthulu|menthya|methi seeds", "spices", "spices fenugreek seed", { staple: true }],
  ["black_pepper", "Black pepper", "milagu|kurumulaku|miriyalu|menasu|kali mirch|pepper", "spices", "spices pepper black", { staple: true }],
  ["fennel", "Fennel seeds", "sombu|perumjeerakam|sompu|saunf", "spices", "spices fennel seed", { staple: true }],
  ["cinnamon", "Cinnamon", "pattai|karuvapatta|dalchini", "spices", "spices cinnamon ground", { staple: true }],
  ["cardamom", "Cardamom", "elakkai|elakka|yalakulu|elaichi", "spices", "spices cardamom", { staple: true }],
  ["clove", "Cloves", "kirambu|grambu|lavangalu|lavanga|laung", "spices", "spices cloves ground", { staple: true }],
  ["star_anise", "Star anise", "annasi poo|thakkolam|chakri phool", "spices", "spices anise seed", { staple: true }],
  ["bay_leaf", "Bay leaf", "brinji ilai|tej patta|bay leaves", "spices", "spices bay leaf", { staple: true }],
  ["asafoetida", "Asafoetida", "perungayam|kayam|inguva|hing", "spices", "asafoetida", { staple: true }],
  ["garam_masala", "Garam masala", "garam masala", "spices", "spices curry powder", { staple: true }],
  ["sambar_powder", "Sambar powder", "sambar podi|sambar masala", "spices", "spices curry powder", { staple: true }],
  ["rasam_powder", "Rasam powder", "rasam podi", "spices", "spices curry powder", { staple: true }],
  ["chettinad_masala", "Chettinad masala", "chettinad masala", "spices", "spices curry powder", { staple: true }],
  ["jaggery", "Jaggery", "vellam|sharkara|bellam|bella|gur", "spices", "sugars brown", { staple: true }],
  ["sugar", "Sugar", "sakkarai|panchasara|chini", "spices", "sugars granulated", { staple: true }],
  ["soy_sauce", "Soy sauce", "soya sauce", "spices", "soy sauce made from soy and wheat shoyu"],
  ["vinegar", "Vinegar", "vinegar|sirka", "spices", "vinegar distilled", { staple: true }],
  ["honey", "Honey", "then|thaen|madhu|tene|shahad", "spices", "honey"],
  // ── Oils ─────────────────────────────────────────────────────
  ["oil", "Cooking oil", "oil|cooking oil|refined oil|sunflower oil|ennai|enna|nune|enne|tel", "oils", "oil sunflower linoleic", { staple: true }],
  ["coconut_oil", "Coconut oil", "thengai ennai|velichenna|kobbari nune|kobbari enne", "oils", "oil coconut", { staple: true }],
  ["gingelly_oil", "Gingelly (sesame) oil", "nallennai|ellenna|nuvvula nune|sesame oil|til oil", "oils", "oil sesame salad or cooking", { staple: true }],
  ["groundnut_oil", "Groundnut oil", "kadalai ennai|kadala enna|verusenaga nune|peanut oil", "oils", "oil peanut salad or cooking", { staple: true }],
  ["mustard_oil", "Mustard oil", "kadugu ennai|sarson tel", "oils", "oil mustard", { staple: true }],
  ["olive_oil", "Olive oil", "olive oil", "oils", "oil olive salad or cooking", { staple: true }],
];

export const INGREDIENT_CATALOG: CatalogItem[] = ROWS.map(([key, name, aliases, aisle, fdcQuery, opts]) => ({
  key,
  name,
  aliases: aliases.split("|").map((a) => a.trim()).filter(Boolean),
  aisle,
  fdcQuery,
  staple: opts?.staple,
  gramsPerPiece: opts?.piece,
}));

export const FAT_KEYS = new Set(["oil", "coconut_oil", "gingelly_oil", "groundnut_oil", "mustard_oil", "olive_oil", "ghee", "butter"]);

export const AISLE_LABELS: Record<Aisle, string> = {
  meat_fish: "Meat & fish",
  eggs_dairy: "Eggs & dairy",
  pulses: "Pulses & soy",
  grains: "Rice, grains & millets",
  vegetables: "Vegetables",
  greens_herbs: "Greens & herbs",
  fruit: "Fruit",
  nuts_seeds: "Nuts & seeds",
  spices: "Spices & condiments",
  oils: "Oils & ghee",
  other: "Other",
};
