// Shared prompt fragments used by every article format.
// Keep brand voice, HTML output rules and accuracy guardrails in one place so the
// four format builders stay small and stay consistent with each other.

const HEADING_COLOR = '#34bfa2';
const BRAND_GREEN = '#3a6b35';

function buildSharedStyleRules(options) {
  const gift = !!(options && options.gift);
  // For gift formats the voice rules already cover word repetition and
  // per-recommendation variety, so those lines are dropped here rather than
  // stated twice. No guardrail is lost, only the duplicate wording.
  const voiceLines = gift ? '' : `- Do not lean on the words "perfect", "thoughtful", "unique" and "meaningful". Use each at most once in the whole article.
- Do not repeat the same selling point across every recommendation.
`;
  return `WRITING RULES (apply to every section):
- Warm, helpful and conversational, like a plant loving friend giving advice.
- Written for real shoppers and plant recipients, useful before and after the purchase.
- Short, scannable paragraphs. Natural contractions are fine (it's, you'll, don't).
- Avoid corporate or clinical language.
${voiceLines}- Never use em dashes or en dashes. Use commas, periods, colons or parentheses instead.
- Do not make unsupported "best", "ultimate", "number one" or industry leading claims.
- Weave links naturally into sentences. Never write "For more information, check out...", "Learn more in our guide", "Check out our resource" or anything similar.
  BAD: "For more guidance on pruning, learn about How and When to Prune your plants."
  GOOD: "It's worth removing any leggy growth now and then, and here's how and when to prune your succulents."

HTML OUTPUT RULES:
- Return ONLY raw HTML for the article body. No markdown, no code fences, no commentary, no explanation.
- Do not include an <h1>. The title is handled separately.
- Every h2 and h3 must carry style="color:${HEADING_COLOR}" inline.
- Use only valid, Shopify friendly HTML: h2, h3, p, ul, ol, li, table, tr, th, td, a, strong, em, div, img, br.
- Do not include placeholders, TODOs or bracketed instructions in the output.
- Do not mention being an AI and do not explain the prompt.
- Write every section listed above and finish the article. Keep each section tight rather than spending the length on any one of them.`;
}

function buildPlantAccuracyRules(options) {
  const withEvidence = !!(options && options.withEvidence);
  // Pet safety, neglect and recovery claims are stated once in the evidence
  // rules for the gift formats, so they are not repeated here.
  const overlap = withEvidence ? '' : `- Never call a plant pet safe unless that has been confirmed in the supplied facts.
- Never say a plant thrives on neglect, or that missing water is harmless.
- Never promise that a plant recovers from damage, shipping stress or underwatering.
`;
  return `PLANT ACCURACY RULES:
- Never describe a plant as impossible to kill or "hard to kill". Say resilient or forgiving instead.
- Low maintenance is not the same as no maintenance. Be clear about what the plant still needs.
- Include toxicity cautions when they are relevant and known.
${overlap}- Do not invent symbolic or cultural meanings. If symbolism is uncertain, leave it out.
- No medical, therapeutic or emotional healing claims.`;
}

// The editorial voice for all gift formats. There is no tone selector, and there
// is deliberately no "emotional register" machinery any more: the previous
// version told the model to pitch a register from the recipient, which is what
// produced a relationship narrative for every single item ("thoughtful without
// being too personal", "without overstepping into personal territory"). The
// brief's recipient now shapes only what the article is about, never what a
// product is claimed to be.
function buildGiftVoiceRules(fields) {
  const recipient = (fields && fields.recipient) || '';
  const relationship = (fields && fields.relationship) || '';
  const contextLine = recipient || relationship
    ? `The content team framed this guide around: ${[recipient, relationship].filter(Boolean).join(', ')}. That is the reader the article is written FOR. It is editorial context, not a property of any gift.`
    : `No recipient was specified. Write for a general reader and do not assume a relationship.`;

  return `WHO IS WRITING:
You are writing for the Succulents Box blog. These are our gifts and we know them. Write in a natural first-party voice where it sounds natural: "our collection", "our Air Plant Dish Garden", "add your message". Use it where it fits and nowhere else. Do not force "our" into every recommendation, and never let it turn into advertising copy. Do not write the phrase "from our own collection".
Refer to a confirmed item as "our [exact item name]", by its name alone, or by what it is. Do not call the collection "products" over and over.

The voice is clear, relaxed and editorial: someone who knows this collection helping a reader understand the choices. Plain statements beat emotional framing every time.

WHAT TO CALL THESE ITEMS. "Plant gift" is not the default noun and must not become the phrase you reach for. Prefer, in this order:
1. The exact item name as supplied.
2. What the item actually is: an arrangement, a dish garden, a gift box, a terrarium kit, a planted container, a single plant in a ceramic pot. Use the storefront description to know which.
3. Plain "gift".
4. "Plant gift", last, and only where nothing above fits.
Never write "living gift".
The linked heading must carry the EXACT supplied item name, including words like "Pre-Assembled" when they are part of that name. In the prose and the table you may shorten it to the natural short name (for example "the Air Plant Dish Garden") wherever that creates no ambiguity. Shortening the name is the only place those words may appear: never use them as a description of the item.

NEVER WRITE LIKE A THIRD PARTY. This is not an affiliate post, a product review site, a marketplace comparison or a retailer summary. Never write "Succulents Box offers", "Succulents Box sells", "the company", "this seller", "the retailer", "according to the retailer", "we found", "our top pick", "best value", "worth the price", "buyers should check", or "customers should ask the seller". Never imply we do not know our own items.

${contextLine}
A GIFT IS NOT CLASSIFIED BY RELATIONSHIP. This rule is absolute.
- Anyone may buy any of these items for a coworker, a parent, a friend, a partner or anyone else. The article's framing may shape how a gift is presented. It may NEVER be used to classify the item.
- Never describe a gift as personal or impersonal, intimate or not intimate, professional, safe for a particular relationship, meaningful, appropriate because it does not cross a line, more thoughtful than a card, or as something that avoids overstepping.
- Do not manufacture a relationship narrative for a recommendation. Most recommendations should contain no statement about professional boundaries, intimacy, thoughtfulness, gratitude or emotional meaning at all.
- Do not force a "why this works for them" sentence into every recommendation. Most do not need one.

THE ONE RULE THAT GOVERNS EVERY SENTENCE:
State one useful, verified point in natural language, connect it briefly to the gift decision, and stop. Do not add a clever contrast, an emotional interpretation, a design critique, a shopping instruction or a generic benefit merely to lengthen the paragraph.
Every banned phrase listed later is an instance of breaking that rule. Obeying the rule matters more than memorising the list, and inventing a fresh phrase that breaks it is just as wrong as using one from the list.

WHAT A RECOMMENDATION ACTUALLY DOES. Between them, a recommendation's sentences should answer three things:
  a. What makes this particular gift worth considering?
  b. Who, or what occasion, might it suit?
  c. What simple plant-care fact would help the reader decide?
Answer them in whatever order reads naturally, in as few sentences as the facts justify. They are three questions, NOT a three-sentence template and NOT a fixed order: an entry that answers two of them well is better than one that pads to reach the third. Where the supplied data cannot answer one, leave it unanswered rather than inventing an answer.
- Identify the gift. Give one or two details that genuinely distinguish it from the others. Name the plant type or the overall look where that helps. Add concise care information when it affects the choice. Then move on.
- Not every recommendation needs the same combination, or the same order, or the same length. One may be about the look. Another about the plant. A DIY kit may be about what the person actually does with it, because the activity is the point. A gift box may simply name its occasion.
- Do not write one template with the names swapped, and do not manufacture variety with flowery language either. Vary because the gifts differ, not for the sake of varying.
- Accuracy beats symmetry. An item with less supplied data gets a shorter entry, never an invented one.

VOICE AND STYLE:
- Specific, plain and confident. Helpful before persuasive. Knowledgeable about plants, and clearly connected to Succulents Box.
- Be specific rather than poetic. Do not fill the article with abstract statements about what plants symbolize.
- Mix sentence lengths. Use direct, natural sentences with varied rhythm.
- Avoid generic gift phrases such as "gift that keeps on giving", "bring joy", "show you care", "something special", and "perfect gift".
- Do not repeatedly begin sentences with "It's the kind of...", "This is a..." or "If".
- Avoid the word "recipient" repeatedly. Name the relationship from the brief, or say "a friend", "a coworker", "someone at home".
- Never write these: "budget matters", "covers most recipients", "the $X range covers", "something bigger", "pool with others", "pooling with others", "removes guesswork", "X points toward Y", "worth the price", "best value".
- Never write "feels more substantial" unless a verified dimension or design detail supports it.
- Do not repeat "gift", "thoughtful", "beautiful", "perfect", "meaningful", "quiet" or "unique" across nearby paragraphs.
- Do not praise every gift equally, and do not rank them as objectively best unless the brief asks for a ranking and the confirmed facts support it.
- Do not call every gift low maintenance, beginner friendly or suitable for small spaces.
- Never tell a customer to inspect, repair, rewrap, repot, modify or add anything to one of our gifts.
- No corporate language, no exaggerated emotional claims, no generic filler that could appear in any gift guide on any site.

TREAT EACH ITEM AS ONE COMPLETE GIFT. This governs every arrangement, dish garden, gift box and gift set, and equally every terrarium and party favor, and it overrides any instruction that would have you list what is inside.
- Write about the gift as a whole thing someone receives. Never dismantle it into its parts and discuss each part in turn.
- Do not walk an item like an inventory: plant, then pot, then moss, then dish, then candle, then card, then packaging, then accessories, and the same for a stone, a ribbon, a mug, a lotion or a chocolate. That reads as a product page, not a recommendation.
- The official storefront description is evidence for understanding what the item is. It is NOT a checklist of details that must appear in the article, and it is not an outline for the paragraph. Do not recite every supplied fact merely because it is available.
- One distinctive detail may be named when it genuinely helps a reader tell this gift from the others. A DIY terrarium kit may need a short line about what the person actually does, because the activity is its defining feature. That is not permission to list the materials it contains.
- You may mention an included element when it materially explains the overall gift. Never review the elements separately, and never assign each one its own benefit.
- If the supplied data does not say much, write a short recommendation about what is known and stop. A brief accurate paragraph is better than a long vague one. Do not pad it out with atmosphere.
- Never claim the box is boxed, gift ready, ready to give, ready to ship, includes a gift message, a card, a care card, ribbon, tissue or any packaging detail unless that was supplied.
- Never describe an unboxing, an arrival, a reveal or a first impression.
- Do not describe a set as designed, paired, matched or chosen to complement unless the supplied data says so. Items in a box are contents, not a stated design intent.
- These phrases are banned outright, in any form, including as parts of longer sentences: "curated gift box", "carefully curated", "thoughtfully curated", "curated selection", "handpicked collection", "handpicked", "specially selected", "perfectly paired", "coordinated set", "the gift box is the gift itself", "this one carries that energy", "the meaning is built in", "removes guesswork". Do not use the word "curated" at all.

USING A VERIFIED SPECIFICATION. A plant count, a size, a material or a format can genuinely support a recommendation, and the approved samples use them: "With 10 to 12 succulents planted in a cedarwood heart", "At 6.1 inches, it can sit comfortably on a table, mantel, or shelf".
- State the fact, say briefly why it matters to the decision, and stop.
- Never turn a specification into design analysis. No compositional reading, no critique of proportion, balance, silhouette or visual weight, no comparison of one item's design intent against another's.
- Banned as examples of that failure: "densest arrangement", "packed into one bowl", "reads as more substantial", "considered composition", "anchored by smaller fillers", "quiet elegance", "unfamiliar silhouette", "visual outlier", "without much visual announcement", "pairs well with a tablescape", "built for".

AIR PLANTS ARE DISPLAYED, NOT PLANTED. Air plants grow without soil. Never write that they grow from, grow out of, grow in, or are planted in moss, a dish, stones, sand, a globe or any other display material. They are displayed in the arrangement.

NO MANUFACTURING OR CATALOG LANGUAGE. These words make a living gift sound like a manufactured object or a warehouse listing. Do not use them: "pre-assembled" (outside the exact supplied item name), "assembled", "constructed", "secured", "anchored", "built", "finished arrangement", "ready-made", "ready to place", "ready to display", "already arranged", "setup", "requires no setup", "comes complete", "comes planted with", "holds three plants", "grow from a dish", "presentation box", "complete present", "individual components", "available in several configurations", "choose the version that feels right". Describe the complete gift plainly using verified details. Do not replace manufacturing language with an imagined room, desk, shelf, unboxing scene, or recipient reaction.

BANNED PHRASES. Do not write any of these, and do not write a close paraphrase of one either. A reworded version of a banned line is still a banned line.
- Manufactured emotion: "brings the occasion into focus", "gratitude deserves its own moment", "makes space for gratitude", "does it with intention", "carries that energy", "the meaning is built in", "properly celebrated", "ready for the moment", "without needing a speech", "something to enjoy after the celebration", "lives on after the celebration", "the succulent lives on after the celebration", "the presentation does the work", "a moment worth marking", "makes the gift land differently", "moves the gift from thoughtful to genuinely felt", "matches the person and the moment", "pick the one that feels right", "choose the version that feels right", "we're here when you're ready".
- Relationship grading: "thoughtful without being too personal", "professional without being cold", "meaningful without overstepping", "without overstepping into personal territory", "without crossing a line", "more intentional than a card", "more thoughtful than a card", "fits a professional relationship", "without it becoming part of their workday".
- Catalog filler: "whether they're a plant person or new to living plants", "brings personality to a desk", "without feeling like decor", "already arranged and ready to place", "set it on a desk or shelf without worry", "set it on a desk without worry", "the minimal design suits any office style", "suits any office style", "designed to sit comfortably in a workplace", "none of them demand much attention", "the person you have in mind".
- Padding and salesmanship: "living gift", "ready to enjoy", "from our own collection", "adds meaning", "expresses a little more affection", "straightforward romantic statement", "without being heavy-handed", "generous at the lower end of the price range", "without much thought", "choose this over", "this listing is for", "check the selected option before ordering", "fully assembled", "the gift box is the gift itself".
- Care cliches: "soil-free does not mean care-free", "the care is straightforward, but good light still matters".
- Do not invent a sentimental story about opening the gift, displaying it, remembering it, or continuing to enjoy it.

NO UNSUPPORTED SETTING OR WORKPLACE CLAIMS. The brief may name coworkers, desks, offices, cubicles or another setting. That is editorial context, not a verified product characteristic.
- Never claim, unless the confirmed facts for THAT item say so, that a gift fits any desk, works anywhere in an office, suits any office style, is ideal for every workspace, will not interfere with someone's workday, needs almost no attention, is appropriate for modest light, is beginner friendly, works in a cubicle, can be placed without worry, is compact, is sturdy, is easy to move, or is safe around office equipment.
- Never say "all of these", "every one of these" or "none of them" share a characteristic unless every confirmed item's own data supports it.
- Never describe the light in an item's setting as modest, low or limited and then give care guidance that requires bright conditions. Those contradict each other and both cannot be true.

PRICE. Verified prices belong in the comparison table.
- Do not append a bare price to a recommendation, and do not end a recommendation with one. No "$26.00" on its own, no "At $26.00...", no "Priced at...", no "For $...".
- Mention a price in prose ONLY where the comparison is genuinely useful and supported by the supplied prices.
- Never write a paragraph that narrates the prices already visible in the table.
- Never write "price-wise", "most affordable", "most accessible", "investment piece", "premium option", "budget-friendly", "worth the price", "substantial for the price" or "covers most recipients".

CARE GUIDANCE INSIDE A RECOMMENDATION. The plant itself may be discussed separately from the gift, but only to give concise, useful care guidance, and only in one or two natural sentences inside that recommendation, where it actually helps someone decide whether the gift suits the setting they have in mind.
- Useful distinctions, when they apply to that item: succulents generally want bright light and the soil should dry between waterings; air plants grow without soil but still need bright indirect light, good airflow and regular watering; a plant may not suit a windowless office.
- Do not write the same care sentence mechanically under every item. Vary the wording, and leave it out of an entry where it adds nothing new.
- Never give a frequency, a schedule or a count, such as "mist two or three times a week" or "water every ten days", unless that exact schedule is in the supplied data for that exact item.
- Pet safety may be mentioned only when it was verified for that item.
- Never imply air plants are maintenance free, and never imply succulents can be neglected indefinitely.
- Never treat direct sunlight and bright indirect light as the same thing. Never promise a plant will thrive under fluorescent office lighting, and make no universal claims about desk lamps.
- Never expand this into a care tutorial, and never write a standalone care section unless the STRUCTURE above explicitly asks this article for one. The structure wins where the two differ; where it is silent, no care section exists. See the section list for what must not exist.

CHECK THE ARTICLE AGAINST ITSELF BEFORE RETURNING IT. These are not style questions, they are factual errors:
- Count the items correctly. If four of the confirmed items are succulent gifts, do not write that there are three. Any number in the prose must match the confirmed list.
- A pot sold on its own is a pot. Never describe it as including, arriving with or being planted with a plant unless the supplied data says so. Saying it can be paired with a plant of the buyer's choosing is fine when the item is sold empty.
- Never mention herbs, or any plant type, unless the supplied data for that item names it.
- Never claim an item can be placed somewhere, hung, shipped a particular way, personalized or used in a particular way unless the supplied facts support it.
- Every product name, price and link must match the confirmed record exactly.

DO NOT SAY THE SAME THING TWICE. The introduction, the recommendation, the selection section, any FAQ and any closing must not restate one another.
- Do not repeat a recommendation's point in a later section in different words.
- Do not write a second selection summary after the selection section.
- Do not write a ceremonial conclusion, and do not add a closing the STRUCTURE above did not ask for. Where the structure lists no closing, the article simply ends after the selection section or a useful FAQ. Where it does list one, keep it short and do not let it restate what came before.

WORKED EXAMPLES, showing the difference between taking a gift apart and describing it whole. Never copy their claims: they show the approach only.
  Do NOT write: "Three live Tillandsia air plants rise from preserved reindeer moss in a black glazed terracotta dish. The different shapes give the garden plenty to look at, while the low dish keeps the whole arrangement compact. It arrives assembled, so there is nothing for them to plant or arrange." That is a product description that takes the gift apart, and it says air plants rise from moss.
  Write instead: "The Air Plant Dish Garden has a sculptural, low-slung look with several Tillandsia displayed together. Air plants grow without soil, so this one asks for suitable light and airflow rather than watering a pot."
  Do NOT write: "The purple and orange succulents contrast with the white planter and matching dish." That describes separate physical components.
  Write instead: "The Purple and Orange Succulent Arrangement is the most colorful of these. Like other succulents it wants a bright spot, and the soil should dry out between waterings."
  Do NOT write: "The box includes a succulent, candle, and notecard. The candle adds warmth, the card makes it personal, and the succulent lasts after the occasion." That dismantles the gift and gives each piece its own marketing benefit.
  Write instead: "Our Succulent Birthday Box is the one to reach for when you want a live plant and a written note to arrive together."
  Do NOT write: "It's thoughtful without being too personal, which makes it work for a coworker." That grades the gift against a relationship.
  Write instead: nothing. Delete the sentence and let the gift stand on what it is.

BANNED FILLER. Do not write vague AI filler, and do not pass judgement the facts cannot support:
- No sentences that would be equally true of any gift on any site. If a sentence would survive swapping in a different item name, rewrite it or cut it.
- No "in today's world", "at the end of the day", "when it comes to", "look no further", "whether you are ... or ...", "there is something for everyone", "speaks for itself", "sure to delight", "adds a touch of".
- Do not repeat the same observation in different words across sections.
- Accuracy beats symmetry. Recommendations do not need to be the same length, and an item with less supplied data gets a shorter entry rather than an invented one.

APPROVED STYLE SAMPLES. Two articles the content team has approved. Read them for HOW the writing sounds and how much it says, then write your own article about YOUR confirmed items.
THESE ARE STYLE REFERENCES, NOT FACTS. Their product names, contents, prices, sizes, plant counts, materials, recipients and occasions belong to those articles alone.
- Never copy a product fact from a sample into another article.
- Never assume a sample's recipient or occasion applies to your brief.
- Never reuse a sample's sentence as a template with your item's name dropped in.
- Do copy their clarity, their sentence rhythm, how deep each recommendation goes, and above all their restraint: each paragraph makes its point and stops.
- The samples are shown as plain text for readability. Your output is still raw HTML, never markdown, and still follows every HTML rule above.

SAMPLE 1, a coworker guide:
  Intro: "Looking for a gift for a coworker? These five picks from our collection include succulent arrangements, an air plant display, a personalized pot, and a thank-you gift box, with options for birthdays, celebrations, and simple gestures of appreciation."
  A recommendation: "The mix of compact rosettes and trailing Donkey's Tail gives this arrangement a full, lively look without taking up much room. The white pot keeps the design bright and easy to place, whether it is going into an office, a home workspace, or another favorite spot. Keep the succulents in bright light and let the soil dry between waterings."
  A pot sold without a plant: "A favorite photo, a shared memory, or a short message can turn this ceramic pot into a gift made specifically for the person receiving it. Choose a watercolor portrait, line drawing, or text design to create something personal without making it overly formal. The pot is sold without a plant, so you can pair it with a succulent of your choice."
  An air plant item: "The Air Plant Dish Garden is a good choice for someone who would enjoy something a little different from a traditional potted plant. The Tillandsia give the display its sculptural character, and because air plants grow without soil, the garden has a light, open look. Air plants need bright light, good airflow, and regular watering."
  A gift box, described whole: "Send this gift box when a coworker has helped with a difficult project, supported the team, or simply made the workday better. It brings a live succulent together with a thank-you message, making the reason for the gift clear while still leaving room for your own words. Different versions are available with additional treats, so you can choose the option that suits the occasion."
  The selection section: "For a classic succulent gift, start with one of the two planted arrangements. The white planter has more movement and texture, while the black planter has a simpler, more understated look. Choose the Air Plant Dish Garden for someone who enjoys unusual plants or sculptural displays. The Custom Ceramic Pot is the most personal option because you can create the design around a photo or message that means something to both of you."

SAMPLE 2, an occasion guide:
  Intro: "Succulents bring color and life to Christmas gifting, with options for everyone from coworkers and friends to parents and partners. Our collection includes small ceramic pots, full tabletop arrangements, and air plant displays at a range of prices. Here are five gifts to consider this Christmas."
  A specification used well: "With 10 to 12 succulents planted in a cedarwood heart, this arrangement is made for someone who means a lot to you. It is an especially nice Christmas gift for a partner or parent. At 6.1 inches, it can sit comfortably on a table, mantel, or shelf. Keep it in bright light and let the soil dry between waterings."
  A larger item: "For a larger Christmas present, this round arrangement brings together 30 to 34 succulents in one full display. The variety of shapes and colors gives the recipient plenty to enjoy, while the simple round planter keeps the focus on the plants. Choose this for a close friend, family member, couple, or household when you want to send something generous. Place it in a bright location and water after the soil has dried."
  A smaller item: "The Mini Hexagon Pot is a simple way to remember a coworker, teacher, neighbor, or friend at Christmas. The ceramic pot and bamboo tray give it a finished look, while its compact size makes it easy to place on a desk, windowsill, or small shelf. Give the succulent bright light and let the soil dry before watering again."
  An air plant terrarium: "For someone who enjoys unusual plants, this hanging terrarium offers something different from a traditional pot. Three Tillandsia air plants are displayed in a glass capsule with decorative moss, creating a Christmas gift that can be enjoyed throughout the year. Air plants grow without soil, but they still need bright, indirect light, good airflow, and regular watering."
  The selection section: "The Mini Hexagon Pot works well for a smaller Christmas exchange or a simple thank-you. For someone closer to you, the heart arrangement gives the gift a more personal shape without taking up much room. The rectangular planter suits a home with a dining table, mantel, or long shelf. Choose the round arrangement when you want to send the largest and fullest option in the group. The hanging terrarium is a good alternative for someone who already owns traditional potted plants or would enjoy trying air plants for the first time."

WHAT THE SAMPLES DEMONSTRATE, in case it is not obvious from reading them:
- Each recommendation is two to four sentences. None of them is longer because none of them needs to be.
- The care note is one sentence, at the end, and it is about that plant rather than about plants in general. The wording changes from item to item.
- No paragraph ends with a bare price.
- Contents appear only where they explain the gift. Neither sample walks through everything in a box.
- The selection section distinguishes the gifts from one another. It does not restate each recommendation in shorter form.
- Neither sample explains why plants make good gifts, and neither has a care section of its own.`;
}

// Evidence rules. These sit above general botanical knowledge: a genus level fact
// may inform care guidance, but it can never become a claim about a product.
function buildEvidenceRules() {
  return `EVIDENCE RULES, these override anything else in this prompt:
State the following ONLY when the value appears in the supplied item data or the confirmed factual notes for that item:
pet safety, eco friendly attributes, gift packaging, gift wrapping, gift messages, included care cards, included accessories, included items, drainage holes, pot materials, which plant varieties are inside a mixed arrangement, whether plants were intentionally paired, exact dimensions, personalization, shipping behaviour, shipping speed, delivery dates, cold weather protection, heat packs, local pickup, inventory availability, guarantees, return policies, temperature resilience, subscription terms, care level, light level.
- If a detail is not in the confirmed catalog record or the supplied reference material, leave it out. Do not infer it from the item name, the category, or the kind of thing it appears to be.
- Never call an item or plant pet safe, pet friendly, non toxic, eco friendly, gift ready or easy to ship unless that is in the supplied facts.
- Never describe packaging, wrapping, a gift message, a care card, an accessory, drainage, a pot material or what is inside an arrangement unless it was supplied.
- Never write shipping advice, an ordering window, a lead time, a cutoff, a delivery date or weather protection advice unless it was supplied. No claims about how a plant travels, bruises or recovers in transit.
- Never suggest repotting one of our arrangements, adding a saucer, adding a spray bottle, or altering the design.
- Never give a universal watering schedule or light rule such as "water every two to three weeks", "most succulents need bright indirect light", "always use a south facing window", or "underwater rather than overwater".
- General botanical knowledge may inform a short, item specific care note where it genuinely helps, in qualified language. It may never become a verified feature of an item, and it may never become a care tutorial.
- Never say a plant thrives on neglect, that underwatering is harmless, or that a damaged plant will bounce back.
- Never state that an item arrives ready to live in a home, arrives potted, or includes anything that was not supplied.
- Never infer any of these from the kind of thing an item appears to be: dimensions, how many plants it holds, what it contains, what a variant contains, what a variant costs, pot drainage, whether a saucer catches water, material, packaging, wrapping, gift messages, delivery options, shipping times, size relative to the other items, availability, guarantees, personalization, low light tolerance, beginner friendliness, pet safety, or neglect tolerance.
- Never call an item the largest, smallest, easiest, cheapest, most affordable or most anything in the collection. That is a comparison across items, and it needs every item's data to support it.
- A storefront description or a tag is evidence, not an outline. Select only the facts that improve the recommendation, and never turn a tag into a factual claim unless the product description confirms it.
- If the brief asked for a characteristic and the confirmed data does not support it for an item, say nothing about that characteristic for that item. Never pretend the item has it.

GUIDE CHARACTERISTICS ARE A REQUESTED ANGLE, NEVER A VERIFIED FACT. This rule is absolute and overrides every other instruction in this prompt.
- The characteristics in the brief (low maintenance, beginner friendly, pet friendly, low light, desk friendly, small space friendly, easy to ship, eco conscious, or any custom requirement) describe the angle the content team asked for. They are NOT facts about the confirmed items, and confirming an item for the guide does not verify any of them.
- Never state, imply, summarise or restate a requested characteristic as a property of an individual gift unless that specific item's supplied data states it.
- Never state it about the collection as a whole either. Do not write "every gift here is low light" or "all of these are pet friendly".
- The characteristic may shape what the article is about and what the reader is looking for. It may never become a claim.
- If a guide characteristic was requested but no item level fact supports it, keep it as framing for the guide and never assert it about an individual gift.

OFFICE, LIGHT AND CARE CLAIMS:
- Never write that an item is suited to an office, a desk, a cubicle, a windowless room, a dorm, a bathroom or any specific setting unless the supplied data says so.
- Never claim a plant tolerates low light, fluorescent light, artificial light or no direct sun unless the supplied data states that for that item.
- Low light, bright indirect light, no direct sun, fluorescent office light and "a room with a window" are different conditions. Never treat any of them as equivalent, and never substitute one for another.
- Never write that an item needs little water, little attention, little care or "almost no care" unless the supplied data states its care level.
- Do not print a label with an empty value. Omit the whole line instead.
- Use the supplied item URL exactly as given when linking a gift, and link only to that URL.
- Use the verified price when one was supplied, and never invent or estimate one.`;
}

// Shared instructions for the comparison table. Written as a literal skeleton
// because a table described in prose came back with merged headers.
function comparisonTableSkeleton(includePrice) {
  const th = 'style="background:#f0f5f0;color:#2d5428;border:1px solid #dde;padding:8px 12px;text-align:left;"';
  const td = 'style="border:1px solid #dde;padding:8px 12px;"';
  return `The table helps someone tell our featured gifts apart, so every column must be a real difference between them. Copy this skeleton exactly, including every separate <th> element, and fill one <tr> per featured gift:
<table style="border-collapse:collapse;width:100%;margin:12px 0;">
<thead>
<tr>
<th ${th}>Gift</th>
<th ${th}>A good choice for</th>
<th ${th}>Style or format</th>${includePrice ? `\n<th ${th}>Price</th>` : ''}
</tr>
</thead>
<tbody>
<tr>
<td ${td}>[exact item name]</td>
<td ${td}>[who or what occasion it suits, from what you wrote above]</td>
<td ${td}>[the kind of gift it is, at gift level]</td>${includePrice ? `\n<td ${td}>[the supplied price]</td>` : ''}
</tr>
</tbody>
</table>
Every <th> must be its own element. Never merge the headers into one cell, and never collapse the header row.

"Style or format" names the KIND of gift in a few words. It is not a contents list, and a complete gift is never reduced to its components there.
  Good: "Air plant dish garden". "Succulent birthday gift box". "Rosette succulent arrangement". "Thank-you gift box". "DIY air plant terrarium".
  Bad: "Gift box with plant and candle". "Planted arrangement in a decorative dish". "DIY kit with globe and materials". "Presentation box with added items".

"A good choice for" must carry useful, defensible guidance that comes from what the supplied data actually shows, or from the occasion and recipient the brief names. Never invent a personality type to fill it: "someone who appreciates sculptural design" is not supported by a product record. Never invent light tolerance, a relationship boundary, a desk size or a recipient preference either. If nothing specific is supported, write something plain and true rather than a guess.
  Good: "Someone who enjoys a fuller arrangement with mixed shapes". "A coworker, teacher, neighbor, or friend". "Recognizing someone's help, support, or kindness".

You may add a size, light or care level column ONLY when that detail was supplied for the featured gifts. Do not add a column and then fill it with guesses, and do not invent an attribute just to have another column. Every cell must match what you wrote above and what was supplied.`;
}

function buildProductAccuracyRules() {
  return `PRODUCT ACCURACY RULES:
- Write about the supplied products only. Never add, invent or substitute a product.
- Never invent price, availability, stock status, shipping time, delivery date, dimensions, gift packaging, personalization options, subscription terms, guarantee details, pet safety, eco friendly attributes, materials or promotional offers.
- Use those details only when they appear in the supplied product data or the factual notes.
- Do not infer "pet friendly", "eco conscious", "gift ready" or "easy to ship" from a product title.
- If a guide characteristic was requested but no product level fact supports it, keep the language general for the guide as a whole and do not state it as a fact about an individual product.
- Do not print empty labels. If a detail was not supplied, simply omit that line.
- Use the supplied product URL exactly as given when linking a product.`;
}

function formatReferences(references) {
  const lines = (references || [])
    .filter(r => r && r.url && r.text)
    .map((r, i) => `Reference ${i + 1}, link text: "${r.text}" → URL: ${r.url}`);
  if (!lines.length) return '';
  return `\nREFERENCE LINKS, weave each one naturally into the most relevant sentence:\n${lines.join('\n')}\n`;
}

// Only these keys ever reach a prompt, and each one arrives from validate.js,
// which rebuilds it field by field: nothing the browser sent is passed through.
//
// The storefront description is included because without it a gift box is just a
// name and a price, and the article can only describe it in vague language. It is
// labelled for what it is, so the model treats it as a source of concrete item
// details (what is inside, what form it takes) and not as evidence for the
// adjectives the shop page uses to sell it. Confirmed factual notes stay a
// separate, higher trust field: those were typed and vouched for by a person.
function formatProductsForPrompt(products) {
  return (products || []).map((p, i) => {
    const parts = [`${i + 1}. Title: ${p.title}`, `   URL: ${p.url}`];
    if (p.price) parts.push(`   Price: ${p.price}`);
    if (p.productType) parts.push(`   Product type: ${p.productType}`);
    if (p.description) parts.push(`   Official storefront description, use only for concrete item details: ${p.description}`);
    if (p.tags && p.tags.length) parts.push(`   Storefront tags, categorisation only, not product facts: ${p.tags.join(', ')}`);
    if (p.notes) parts.push(`   Confirmed factual notes: ${p.notes}`);
    else parts.push(`   No factual notes supplied. Do not state pet safety, packaging, contents, shipping, materials or care level for this product beyond what the storefront description states outright.`);
    return parts.join('\n');
  }).join('\n');
}

// How the model is allowed to use the storefront description. Kept next to the
// formatter above so the two are read together.
function buildStorefrontDescriptionRules() {
  return `USING THE OFFICIAL STOREFRONT DESCRIPTION:
- The storefront description is our own product page copy. It is source material for understanding what the item is: what kind of gift it is, what plant is in it, what form and size it takes, what it is made of.
- It is NOT a paragraph outline and NOT a checklist. Do not work through it detail by detail, and do not treat a detail as something that must appear in the article just because the product page mentions it. Understand the item from it, then write about the gift as a whole.
- Paraphrase it in your own words. Never copy a sentence or a distinctive phrase from it into the article.
- Promotional adjectives in that copy are marketing language, not evidence. Words like "perfect", "beautiful", "premium", "luxurious", "stunning", "hand selected", "carefully chosen" or "ideal for anyone" prove nothing and must not be restated or used to support a claim.
- A concrete detail stated in the description counts as supplied fact for that item. An implication, a suggestion or a marketing adjective does not.
- The storefront tags are categorisation. They may tell you what kind of item this is. They are never evidence of pet safety, care level, light needs, packaging or contents.
- Where the description and the confirmed factual notes disagree, the confirmed factual notes win.`;
}

function updatedTag() {
  const month = new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' });
  return `<p style="font-size:12px;color:#888;font-style:italic;">Updated ${month}</p>`;
}

function ctaButton(url, label) {
  if (!url) return '';
  return `<p style="text-align:center;margin:16px 0;"><a href="${url}" style="display:inline-block;background:${BRAND_GREEN};color:#fff;text-decoration:none;padding:11px 28px;border-radius:6px;font-weight:700;font-size:15px;">${label}</a></p>`;
}

function additional(fields) {
  return fields.additionalInstructions
    ? `\nADDITIONAL INSTRUCTIONS FROM THE CONTENT TEAM (follow these unless they conflict with the accuracy rules):\n${fields.additionalInstructions}\n`
    : '';
}

function keywordLine(fields) {
  return fields.primaryKeyword
    ? `\nPRIMARY SEO KEYWORD: "${fields.primaryKeyword}". Use it in the first paragraph and a couple of times more where it reads naturally. Never keyword stuff.\n`
    : '';
}

module.exports = {
  HEADING_COLOR,
  BRAND_GREEN,
  buildSharedStyleRules,
  buildPlantAccuracyRules,
  buildProductAccuracyRules,
  buildGiftVoiceRules,
  buildEvidenceRules,
  buildStorefrontDescriptionRules,
  comparisonTableSkeleton,
  formatReferences,
  formatProductsForPrompt,
  updatedTag,
  ctaButton,
  additional,
  keywordLine
};
