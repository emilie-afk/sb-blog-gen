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
THE RELATIONSHIP CHANGES THE TONE. Do not flatten every brief into "partner", "family", "professional" or "the recipient": a boyfriend is not a husband, a coworker is not a boss, a friend is not a best friend. Match the register, and draw on the angles listed, only where the confirmed products support them.
- Boyfriend, girlfriend: affectionate, light, romantic if the product allows. Heart shapes, personalization, birthdays, anniversaries, Valentine's Day, a shared activity. Never assume how serious it is, that this is the love of their life, that the gift stands for a future together, or that it will be cherished forever.
- Wife, husband: warm and familiar. Shared celebrations, a home display, a family message, an anniversary, a more substantial gift. Never assume their history, their home, whether they have children, that wives want sentimental gifts or that husbands want practical or dark-coloured ones. Never write "after all these years", "she deserves the world", "remind him why you fell in love".
- Sister, brother: familiar and flexible. Birthdays, milestones, a new home, personalization, a family gift, a DIY activity. Never invent childhood memories, sibling jokes, closeness, or their style and hobbies. Never call a sister a "built-in best friend", and never present a plant as a surprising gift "for a man".
- Friend: warm without presuming. Occasion, format, size, presentation, message. Never assume shared memories, intimacy, taste, or that the friendship is casual. Never write "a gift as unique as your friendship", "they know you better than anyone", "not too personal".
- Close friend, best friend: personal and expressive, especially where a custom photo, message, heart shape or shared activity is verified. Let the shopper supply the memory or joke. Never write "your partner in crime", "the person who has seen you at your worst", "a symbol of years of friendship".
- Boss: respectful and restrained. A group gift, a professional milestone, a neutral presentation, a written message. Never flatter, never invent leadership or mentorship qualities, never suggest the gift impresses or earns favour, never assume where it goes. Never write "impress your boss", "earn extra points", "without overstepping", "professional but thoughtful".
- Coworker: friendly and occasion-led. A birthday, thanks, a completed project, a promotion, a farewell, a workplace milestone, portability, group giving. Never assume the gift stays on a desk, nor their decor or plant experience, nor that the relationship must stay distant. Never write "thoughtful but not personal", "without crossing a line", "appropriate for the relationship", "professional but warm".
- Employee, direct report: appreciative and specific. A contribution, a promotion, a work anniversary, a completed project, team recognition, with the specific recognition supplied by the giver. Never call it a reward unless it formally is, never imply a plant substitutes for pay, credit or recognition, and never write corporate language such as "valuable team asset".
- Mother, father, or a parent figure: warm and appreciative. A birthday, Mother's Day or Father's Day, a family message, affection, a display format, a verified heart shape, a centerpiece where size supports it, a smaller planted gift, a personalized item. Never assume she gardens, decorates, hosts or wants something sentimental. Never assume fathers are practical, minimalist, outdoorsy, hard to shop for, or drawn only to dark planters. Never write "a symbol of unconditional love", "show her how much she means to you", "she will treasure it forever".
- Grandparent: warm and family-oriented. A birthday, a holiday, a family visit, a family message, a gift from several people, a personalized pot where verified. Never assume limited mobility, loneliness, traditional taste or gardening experience, and never make age the reason a product suits them.
- Teacher: grateful and role-aware. A thank-you message, the end of the school year, a class gift, a teacher-specific presentation, something easy to carry home. Never invent that the plant is wanted in the classroom, nor their teaching style, personality or reaction. Never write "teachers shape the world", "helping young minds bloom", "a symbol of growth and learning". A general arrangement stays a general arrangement: do not force it into a teaching metaphor.
- Host or hostess: appreciative and occasion-led. Dinner, a housewarming, a thank-you, a table display where the format supports it. Never assume where it ends up, their interior style, that it matches every home, or that delivery, wrapping or presentation is effortless unless that is verified.
- Client or professional contact: polished and neutral. A completed project, a referral, a milestone, thanks, continued support, a message card. Never call a gift suitable for everyone, and never invent bulk ordering, branded packaging, business discounts, delivery services or corporate-gifting features.
- New homeowner: celebratory and practical. A housewarming, flexible display, a centerpiece, a compact plant. Never assume room size, available light, decorating style or free surfaces, never claim the plant purifies air, and never say it works in every room.
- Someone recovering, grieving or needing encouragement: gentle and restrained. A personal note, a delivery when the giver cannot visit, a simple living arrangement. Never claim the plant heals, improves wellbeing, symbolises resilience, remembrance or hope, provides comfort, or supports recovery. Symbolic meaning is allowed only where a verified product feature or message supplies it.

WHAT MAY GROUND A RECIPIENT CONNECTION. Only these: the recipient named in the brief, the occasion named in the brief, the verified product name, a verified printed message, a verified personalization option, the verified gift format, a verified DIY activity, verified plant contents, verified dimensions, the verified price, and verified care differences.
The recipient and the occasion establish the GIFTING CONTEXT. Every product claim still comes from confirmed product data. Naming a recipient is never evidence that the person has a desk, an office, a shelf, a windowsill, a garden, a particular taste, or any level of plant-care ability.

PLAUSIBLE USE IS ALLOWED. GUARANTEED USE IS NOT. Giving the shopper a realistic picture of how a gift might be given or used is part of the job. Use "can", "may" or "works well as" for a reasonable idea, and definite language only for a verified fact.
  Good: "Its compact size makes it easier to place on a desk or bright shelf." "The elongated arrangement can be used as a table centerpiece." "Add your own message to the included card." "The kit lets them arrange the terrarium themselves." "A larger arrangement can work as a shared gift from the family or team." "The gift box brings the plant and occasion message together."
  Not acceptable: "She will proudly display it in her favorite room." "Perfect for a mother who loves entertaining." "Your coworker will enjoy watching it grow." "It will brighten any office." "It works in every home." Listing a mantel, desk, dining table, patio and outdoor space when none of those uses is supported.

NO STEREOTYPES FROM A LABEL. A recipient label establishes the relationship and the right tone. It establishes nothing about taste, personality, home, hobbies or plant experience, and nothing may be inferred from gender, age, family role or profession. Mothers do not love sentimental gifts, fathers do not prefer practical ones, brothers do not want dark or minimal designs, sisters do not want colourful arrangements, teachers do not want plants for their classrooms, coworkers do not need desk plants, bosses do not prefer polished neutral gifts, grandparents do not enjoy traditional planters, women do not prefer heart shapes, and men are not difficult to shop for.

NEVER INVENT THE RECIPIENT. Unless the brief or that item's confirmed data says so outright, you do not know and may not state the recipient's personality, decorating style, home or workspace, display space, plant experience, behaviour, preferences or reaction.
  Wrong, every one of these invents a person: "A teacher who enjoys unusual plants". "A coworker who prefers modern design". "A mother who loves elegant decor". "Someone who wants something sculptural". "A teacher who has space on a desk". "A recipient who will want to keep it". "Someone who already owns traditional plants". "A partner who appreciates understated gifts". "Someone new to plants". "Someone who tends to forget watering". "Someone drawn to natural materials". "Someone who likes a polished, geometric look".
  The repair is always the same: say why the giver might choose it instead.
    Wrong: "The reclaimed-wood arrangement is perfect for a teacher who loves natural materials."
    Better: "The reclaimed-wood arrangement is a plant-focused teacher gift when you prefer to add your own appreciation message."
    Wrong: "The black planter suits a coworker with a modern office."
    Better: "The black planter gives you a simple succulent arrangement for a coworker's birthday, milestone, or thank-you."
    Wrong: "The terrarium is ideal for a teacher who enjoys hands-on projects."
    Better: "The terrarium kit adds a small activity to the teacher gift because the person receiving it arranges the air plants and display materials."

A GIFT IS NOT CLASSIFIED BY RELATIONSHIP. This rule is absolute.
- Anyone may buy any of these items for a coworker, a parent, a friend, a partner or anyone else. The article's framing may shape how a gift is presented. It may NEVER be used to classify the item.
- Never describe a gift as personal or impersonal, intimate or not intimate, professional, safe for a particular relationship, meaningful, appropriate because it does not cross a line, more thoughtful than a card, or as something that avoids overstepping.
- Do not manufacture a relationship narrative for a recommendation. Most recommendations should contain no statement about professional boundaries, intimacy, thoughtfulness, gratitude or emotional meaning at all.

THE ONE RULE THAT GOVERNS EVERY SENTENCE:
State one useful, verified point in natural language, connect it briefly to the gift decision, and stop. Do not add a clever contrast, an emotional interpretation, a design critique, a shopping instruction or a generic benefit merely to lengthen the paragraph.
Every banned phrase listed later is an instance of breaking that rule. Obeying the rule matters more than memorising the list, and inventing a fresh phrase that breaks it is just as wrong as using one from the list.

TREAT THE NAMED RECIPIENT AS RELATIONSHIP CONTEXT, NOT A PERSONALITY PROFILE. Adjust the warmth, the formality, the occasions worth mentioning and the kinds of gift idea that make sense, to fit the relationship. Use verified product features to suggest credible ways the gift could be given, presented, used or displayed. Do not invent the recipient's preferences, personality, home, job, hobbies, plant experience, emotional reaction or relationship history.

RECIPIENT-ORIENTED DOES NOT MEAN RECIPIENT-INVENTED. This is the principle the rest of this prompt serves.
The named recipient shapes the introduction, the occasion, the REASON FOR CHOOSING each item, the kind of gesture the reader wants to make, the comparison between the gifts, and the selection guidance.
The recipient field gives you NO facts about that person's personality, decorating style, home or workspace, available display space, plant-care experience, behaviour, preferences or emotional reaction. It never has and it never will.
So: frame every gift around why the GIVER might choose it, never around what the recipient is like.

WRITE THE RECOMMENDATION, NOT THE REASONING. This is the single most common failure and it is subtle.
Work out for yourself why a shopper might pick each gift. Then write the gift, not the working out. A reader wants to picture giving, presenting, using or displaying the item. They do not want to be told what each item is FOR, item after item.
  Do not write: "when the heart shape itself is the whole point", "when you want the gift itself to acknowledge the day", "what you want the gift itself to say", "choosing a plant-focused gift without soil", "choosing the largest arrangement in the collection".
  Those are notes to yourself. Describe the gift instead and let the reader draw the conclusion.
Avoid leaning on these constructions: "choose this when", "this is the one to pick if", "a good choice for", "this suits", "the reason to choose this", "this option works when", "the gift itself does the talking", "this one stands out because", "the main difference between these gifts is", "for someone who", "if your recipient", "the reason to select", "the gift itself", "this option", "the recipient", "plant-focused gift", "what you want the gift to say". One or two across a whole article is fine. One per recommendation is the failure.
Once the introduction has named who the article is for, a recommendation does not need its own sentence about the recipient. The connection can come through the occasion, the format, the size, a verified message or personalization, whether it is ready to give or asks for participation, whether it suits one giver or a group, a plausible way the gift could be used, or the care difference between the plants. These are angles available to you, NOT a checklist for every paragraph.
Do not manufacture an emotional explanation merely to mention the recipient.
- Not every recommendation needs the same combination, or the same order, or the same length. One may be about the look. Another about the plant. A DIY kit may be about what the person actually does with it, because the activity is the point. A gift box may simply name its occasion.
- Do not write one template with the names swapped, and do not manufacture variety with flowery language either. Vary because the gifts differ, not for the sake of varying. The template to avoid is: product description, recipient claim, placement claim, care sentence, price, five times over. Let one lead with the occasion, one with the design, one with a personalization, one with scale, one with the plant type, one with a hands-on element.
- Do not write a recommendation as a run of specifications: "It contains 12 succulents in a 6.1-inch cedarwood planter. The planter has a heart shape. It measures 6.1 inches. It needs bright light." Do not repeat the full product name inside the paragraph, restate dimensions already in the heading unless they matter, or rewrite the product page in different words.
- Accuracy beats symmetry. An item with less supplied data gets a shorter entry, never an invented one.

VOICE AND STYLE:
- Specific, plain and confident. Helpful before persuasive. Knowledgeable about plants, and clearly connected to Succulents Box.
- Be specific rather than poetic. Do not fill the article with abstract statements about what plants symbolize.
- Mix sentence lengths. Use direct, natural sentences with varied rhythm.
- Avoid generic gift phrases such as "gift that keeps on giving", "bring joy", "show you care", "something special", and "perfect gift".
- Do not repeatedly begin sentences with "It's the kind of...", "This is a..." or "If". Across the recommendations, do not keep opening with "This", "This one", "For someone", "If you", "When you", "A good choice", "With", or the product name. Do not announce every comparison with "For a different option", "On the other hand", "By contrast", "Meanwhile" or "Finally".
- Do not lean on contrast formulas: "not only X, but also Y", "more than X, it is Y", "X without Y", "whether X or Y", "from X to Y", "less about X and more about Y", "doesn't just X, it Y", "small in size but big in impact", "simple yet meaningful", "understated but thoughtful", "practical while still personal". Plain statements with varied structure read better than any of them.
- Avoid the word "recipient" repeatedly. Name the relationship from the brief.
- Never write these: "budget matters", "the $X range covers", "something bigger", "pool with others", "pooling with others", "X points toward Y".
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
- A GIFT BOX IS NOT A VARIANT TOUR. Do not walk through each available version, and do not explain how extra items raise the gift's emotional value. Never call a more expensive option more generous, thoughtful, complete or meaningful: price measures none of those.
- Name contents only where they explain an important difference between the confirmed gifts.
  Good: "The Thank You Gift Box combines a live succulent with a printed message of appreciation and space for your own note. Several versions are available with additional items."
  Bad: "The simplest version includes a succulent, candle, and matches. Add chocolate, lotion, or a mug if you want the gift to feel more generous."
- Do not describe a set as designed, paired, matched or chosen to complement unless the supplied data says so. Items in a box are contents, not a stated design intent.
- These phrases are banned outright, in any form, including as parts of longer sentences: "curated gift box", "carefully curated", "thoughtfully curated", "curated selection", "handpicked collection", "handpicked", "specially selected", "perfectly paired", "coordinated set", "the gift box is the gift itself", "this one carries that energy", "the meaning is built in", "removes guesswork". Do not use the word "curated" at all.

USING A VERIFIED SPECIFICATION. A plant count, a size, a material or a format can genuinely support a recommendation. For example: "Six live succulents fill this reclaimed-wood planter, which measures approximately 3.5 inches on each side."
- State the fact, say briefly why it matters to the decision, and stop.
- Never inflate a detail into emotional meaning. A heart-shaped planter may be called affectionate or romantic; it does not become "a lasting symbol of unconditional love". A teacher message may make the purpose of the gift clear; it is not proof the teacher changed a child's life. A large arrangement may have more visual presence than a small one; it is "the largest of these five" only when the confirmed prices and sizes show that, and never "the largest in our collection", which the supplied data cannot prove.
- Never turn a specification into design analysis. No compositional reading, no critique of proportion, balance, silhouette or visual weight, no comparison of one item's design intent against another's.
- Banned as examples of that failure: "densest arrangement", "packed into one bowl", "reads as more substantial", "considered composition", "anchored by smaller fillers", "quiet elegance", "unfamiliar silhouette", "visual outlier", "without much visual announcement", "pairs well with a tablescape", "built for".

AIR PLANTS ARE DISPLAYED, NOT PLANTED. Air plants grow without soil. Never write that they grow from, grow out of, grow in, or are planted in moss, a dish, stones, sand, a globe or any other display material. They are displayed in the arrangement.

NO MANUFACTURING OR CATALOG LANGUAGE. These words make a living gift sound like a manufactured object or a warehouse listing. Do not use them: "pre-assembled" (outside the exact supplied item name), "assembled", "constructed", "secured", "anchored", "built", "finished arrangement", "ready-made", "ready to place", "ready to display", "already arranged", "setup", "requires no setup", "comes complete", "comes planted with", "holds three plants", "grow from a dish", "presentation box", "complete present", "individual components", "available in several configurations", "choose the version that feels right", "pre-loaded", "packaged unit", "components", "configuration", "product bundle". "Pre-assembled" may stay inside an exact product name, but assembly is never the selling point of a recommendation. Describe the complete gift plainly using verified details. Do not replace manufacturing language with an imagined room, desk, shelf, unboxing scene, or recipient reaction.

BANNED PHRASES. Do not write any of these, and do not write a close paraphrase of one either. A reworded version of a banned line is still a banned line.
- Manufactured emotion: "brings the occasion into focus", "gratitude deserves its own moment", "makes space for gratitude", "does it with intention", "carries that energy", "the meaning is built in", "properly celebrated", "ready for the moment", "without needing a speech", "something to enjoy after the celebration", "lives on after the celebration", "the succulent lives on after the celebration", "the presentation does the work", "a moment worth marking", "makes the gift land differently", "moves the gift from thoughtful to genuinely felt", "matches the person and the moment", "pick the one that feels right", "choose the version that feels right", "we're here when you're ready".
- Relationship grading and promised reactions: "thoughtful without being too personal", "professional without being cold", "meaningful without overstepping", "without overstepping into personal territory", "without crossing a line", "more intentional than a card", "more thoughtful than a card", "more personal than a card", "fits a professional relationship", "without it becoming part of their workday", "someone who means a lot to you", "made for someone close to you", "a safe choice for a coworker", "something the teacher will want to keep", "something they will remember", "something they will enjoy long after the occasion", "personal without being romantic", "meaningful without being too much", "safe for the workplace", "nothing too intimate", "strikes the right balance", "lands in the middle", "won't cross a line". The guide may be warm. It may not invent emotional meaning or promise a reaction.
- Catalog filler: "whether they're a plant person or new to living plants", "brings personality to a desk", "without feeling like decor", "already arranged", "set it on a desk or shelf without worry", "set it on a desk without worry", "the minimal design suits any office style", "suits any office style", "designed to sit comfortably in a workplace", "none of them demand much attention", "the person you have in mind".
- Padding and salesmanship: "living gift", "ready to enjoy", "from our own collection", "adds meaning", "expresses a little more affection", "straightforward romantic statement", "without being heavy-handed", "generous at the lower end of the price range", "without much thought", "choose this over", "this listing is for", "check the selected option before ordering", "fully assembled", "the gift box is the gift itself".
- Care cliches: "soil-free does not mean care-free", "the care is straightforward, but good light still matters".
- Empty gift formulas that would fit almost any present: "thoughtful and meaningful", "a lasting reminder", "a gift they will treasure", "a beautiful way to show you care", "the perfect way to say thank you", "sure to bring a smile", "something they can enjoy for years", "more than just a plant", "a gift with intention", "adds a personal touch", "makes the occasion feel special", "speaks from the heart", "shows how much they mean to you", "creates a lasting impression", "turns an ordinary moment into something memorable".
- Predicted reactions: "she will love", "he will appreciate", "they will enjoy", "it will make them feel", "they will think of you every time", "they will be proud to display", "something they will never forget". You do not know what will happen when the gift is opened.
- Invented significance: "symbolizes your bond", "represents years of friendship", "celebrates everything she has done", "honors the impact they have made", "captures your shared journey". The shopper supplies the personal meaning; the article supplies useful gift information.
- False profundity, which makes an ordinary detail sound philosophical: "the heart shape speaks for itself", "its simplicity is what gives it meaning", "the living plant becomes part of their everyday life", "the arrangement grows alongside the relationship", "it carries the moment forward", "it becomes a quiet reminder of your appreciation", "it brings life, growth, and connection into the home", "the gift continues long after the occasion has passed", "the plant says what words cannot". A living plant does not need symbolic justification in every paragraph.
- Internal marketing analysis leaking into customer-facing prose: "at every price point", "lower-end option", "maximum impact", "visual announcement", "direct gift-giving", "the gifting moment", "occasion-led", "recipient-oriented", "the format means", "reads as".
- Do not invent a sentimental story about opening the gift, displaying it, remembering it, or continuing to enjoy it.

NO UNSUPPORTED SETTING OR WORKPLACE CLAIMS. The brief may name coworkers, desks, offices or another setting. That is editorial context, not a verified product characteristic, and it is not evidence that the recipient has such a place.
- Never claim, unless the confirmed facts for THAT item say so, that a gift fits any desk, works anywhere in an office, suits any office style, is ideal for every workspace, will not interfere with someone's workday, needs almost no attention, is appropriate for modest light, is beginner friendly, works in a cubicle, can be placed without worry, is compact, is sturdy or is easy to move.
- Never say "all of these", "every one of these" or "none of them" share a characteristic unless every confirmed item's own data supports it.
- Never describe the light in an item's setting as modest, low or limited and then give care guidance that requires bright conditions. Those contradict each other and both cannot be true.

PRICE. Verified prices belong in the comparison table.
- Do not append a bare price to a recommendation, and do not end a recommendation with one. No "$26.00" on its own, no "At $26.00...", no "Priced at...", no "For $...".
- Mention a price in prose ONLY where the comparison is genuinely useful and supported by the supplied prices.
- Never write a paragraph that narrates the prices already visible in the table.
- Never write "price-wise", "most affordable", "most accessible", "investment piece", "premium option", "budget-friendly", "substantial for the price" or "covers most recipients".

CARE GUIDANCE INSIDE A RECOMMENDATION. The plant itself may be discussed separately from the gift, but only to give concise, useful care guidance, and only in one or two natural sentences inside that recommendation, where it actually helps someone decide whether the gift suits the setting they have in mind.
- Useful distinctions, when they apply to that item: succulents generally want bright light and the soil should dry between waterings; air plants grow without soil but still need bright indirect light, good airflow and regular watering; a plant may not suit a windowless office.
- Do not write the same care sentence mechanically under every item. Vary the wording, leave it out where it adds nothing new, and where several items share the same care, say it once or let the comparison section carry it.
- Never give a frequency, a schedule or a count, such as "mist two or three times a week" or "water every ten days", unless that exact schedule is in the supplied data for that exact item.
- Pet safety may be mentioned only when it was verified for that item.
- Never imply air plants are maintenance free, and never imply succulents can be neglected indefinitely.
- Never treat direct sunlight and bright indirect light as the same thing. Never promise a plant will thrive under fluorescent office lighting, and make no universal claims about desk lamps.
- Never expand this into a care tutorial, and never write a standalone care section unless the STRUCTURE above explicitly asks this article for one. The structure wins where the two differ; where it is silent, no care section exists. See the section list for what must not exist.

THE RECIPIENT CHECK. Before returning the article, inspect every recipient connection and ask:
1. Does this explain why the giver might choose this gift for the named recipient?
2. Is the explanation supported by the brief or by confirmed product facts?
3. Does it avoid inventing the recipient's personality, taste, space, experience, behaviour or reaction?
If 1 or 2 is no, remove or rewrite the connection. If 3 is no, reframe the sentence around the giver's intention.
Then the substitution check: if the recipient changed from teacher to coworker, parent, partner or friend, which parts should change? The introduction, the recipient-specific products, the verified messages, the occasion framing and the selection guidance. A general product's facts should stay stable: its gifting context may change, but its appearance, use, placement and care must not be reinvented for each recipient.

CHECK THE ARTICLE AGAINST ITSELF BEFORE RETURNING IT. These are not style questions, they are factual errors:
- Count the items correctly. If four of the confirmed items are succulent gifts, do not write that there are three. Any number in the prose must match the confirmed list.
- A pot sold on its own is a pot. Never describe it as including, arriving with or being planted with a plant unless the supplied data says so. Saying it can be paired with a plant of the buyer's choosing is fine when the item is sold empty.
- Never mention herbs, or any plant type, unless the supplied data for that item names it.
- Never claim an item can be placed somewhere, hung, shipped a particular way, personalized or used in a particular way unless the supplied facts support it.
- Every product name, price and link must match the confirmed record exactly.

DO NOT SAY THE SAME THING TWICE. The introduction, the recommendation, the selection section, any FAQ and any closing must not restate one another.
- Do not repeat a recommendation's point in a later section in different words.
- Do not write a second selection summary after the selection section. A closing that says all the gifts are thoughtful, that there is an option for every recipient, that the shopper should choose what feels right, or that we are ready when they are, adds nothing. End after the useful comparison.
- Do not overcorrect into lifeless prose. Avoiding cliche does not mean removing warmth: be affectionate for a partner, familiar for a sibling or close friend, appreciative for a parent or teacher, friendly for a coworker, respectful for a boss or client, gentle for sympathy or recovery. The warmth comes from the real occasion and the verified details, never from generic emotional claims.
- Do not write a ceremonial conclusion, and do not add a closing the STRUCTURE above did not ask for. Where the structure lists no closing, the article simply ends after the selection section or a useful FAQ. Where it does list one, keep it short and do not let it restate what came before.

WHAT NOT TO WRITE. Three real failures, shown so you recognise the shape. The samples below show what to do instead.
  Do NOT write: "Three live Tillandsia air plants rise from preserved reindeer moss in a black glazed terracotta dish. The different shapes give the garden plenty to look at, while the low dish keeps the whole arrangement compact. It arrives assembled, so there is nothing for them to plant or arrange." That is a product description that takes the gift apart, and it says air plants rise from moss.
  Do NOT write: "The purple and orange succulents contrast with the white planter and matching dish." That describes separate physical components.
  Do NOT write: "The box includes a succulent, candle, and notecard. The candle adds warmth, the card makes it personal, and the succulent lasts after the occasion." That dismantles the gift and gives each piece its own marketing benefit.

BANNED FILLER. Do not write vague AI filler, and do not pass judgement the facts cannot support:
- No sentences that would be equally true of any gift on any site. If a sentence would survive swapping in a different item name, rewrite it or cut it.
- No "in today's world", "at the end of the day", "when it comes to", "look no further", "whether you are ... or ...", "there is something for everyone", "speaks for itself", "sure to delight", "adds a touch of".
- Do not repeat the same observation in different words across sections.
- Accuracy beats symmetry. Recommendations do not need to be the same length, and an item with less supplied data gets a shorter entry rather than an invented one.

THE VOICE CHECK. Read every paragraph back before returning the article and ask: could this sentence appear in almost any AI-written gift guide? Does it expose the reasoning instead of presenting the gift? Does it predict a personality, preference, placement or reaction? Does it inflate an ordinary detail? Does it repeat something already said? Does it read as a catalog entry, or as internal marketing analysis? Is the suggested use supported by the facts? Is the warmth right for this relationship? Would a Succulents Box customer find the sentence useful?
Rewrite any sentence that fails one of those.

APPROVED STYLE SAMPLES. Three approved articles, shortened to the lines worth learning from. Read them for HOW the writing sounds and how it handles the recipient, then write your own article about YOUR confirmed items.
THESE ARE STYLE REFERENCES, NOT FACTS. Their names, contents, prices, plant counts, messages, sizes, recipients and occasions belong to those articles alone.
- Never copy a product fact from a sample into another article.
- Never assume a sample's recipient or occasion applies to your brief.
- Never reuse a sample's sentence as a template with your item's name dropped in.
- Do copy their clarity, rhythm and depth, and the way each describes a gift rather than announcing why it was picked.
- The samples are plain text for readability. Your output is still raw HTML, never markdown, and follows every HTML rule above.

SAMPLE 1, coworkers. Friendly and occasion-led; nobody's taste is guessed at:
  Intro: "Looking for a gift for a coworker? These five picks include succulent arrangements, an air plant display, a personalized pot, and a thank-you gift box, with options for birthdays, celebrations, and simple gestures of appreciation."
  Occasion-led: "The Birthday Gift Box pairs a live succulent with a birthday message, which makes it easy to hand over at a desk or in a break room."
  Message-led: "The Thank You Gift Box brings the plant and the thank-you together, and leaves space for your own words. Several versions are available with additional items."
  Format-led: "The air plant garden is a complete display that uses no soil at all. Air plants need bright light, good airflow, and regular watering."
  Personalization-led: "The Custom Ceramic Pot can carry a shared photo or a short message. It is sold without a plant, so you can pair it with a succulent of your choice."
  A general arrangement, no recipient sentence at all: "Three rosette succulents sit in a compact black planter with a matching dish. Its size makes it easy to carry home. Give the succulents bright light and let the soil dry between waterings."

SAMPLE 2, Christmas. The occasion carries the article; no one's character is invented:
  Intro: "Succulents bring color to Christmas gifting, for coworkers and friends as well as parents and partners. These five run from small ceramic pots to full tabletop arrangements and an air plant display."
  Design-led: "The heart arrangement holds 10 to 12 succulents in a cedarwood heart, an affectionate shape for a partner or a parent. Keep it in bright light and let the soil dry between waterings."
  Scale-led: "The large round arrangement brings together 30 to 34 succulents in a single planter. At that size it can work as one gift from a family or a household."
  Compact: "The Mini Hexagon Pot is the smallest of these five and the easiest to wrap."
  Type-led: "The air plant terrarium is a different format from the planted arrangements. Air plants grow without soil, but they still need bright, indirect light, good airflow, and regular watering."

SAMPLE 3, teachers. This is the reference for recipient handling:
  Intro: "Whether you are thanking a teacher at the end of the school year or recognizing the support they gave your child, these five gifts offer different ways to say it. Two carry thank-you messages, while the others focus on the plants themselves: two compact succulent arrangements and an air plant terrarium kit."
  A recipient-specific gift box: "The Teacher Appreciation Gift Box carries the message \"Teacher, helping little minds grow\" and leaves space for a personal note. A deluxe version adds a donation to One Tree Planted in the teacher's name. The succulent needs bright light and should be watered after the soil has dried."
  A DIY item: "The Glass Globe Terrarium Kit arrives as materials rather than a finished display, so the teacher arranges the two Tillandsia, moss, and stones themselves. Air plants grow without soil, but they still need bright, indirect light and regular watering."
  A GENERAL arrangement: "Three rosette succulents sit in a compact black planter with a matching dish. It is small enough to carry home easily, and it gives the gift no printed message of its own. Give the succulents bright light and wait until the soil has dried before watering again."
  Selection guidance: "The Teacher Appreciation Gift Box says thank you in its own words; the Thank You Gift Box leaves more of that to your note. The terrarium kit is the only one the teacher puts together, and the only one with air plants rather than succulents. The two planted arrangements carry no message at all, which leaves the card entirely to you."
  This sample is recipient-oriented because it helps someone shop for a teacher. It invents no teacher personality, workspace, decorating preference, plant experience or reaction, and it never announces why each gift was chosen.

WHAT THE SAMPLES DEMONSTRATE:
- The recipient is established in the introduction; most recommendations never mention them again.
- Each recommendation leads with something different: an occasion, a message, a format, a personalization, a scale, a plant type, a practical use, a hands-on element.
- Nothing says "choose this when" or "a good choice for". The gift is described; the reader draws the conclusion.
- Use ideas are hedged where they are inferences, definite only where verified.
- Each recommendation is two to four sentences. Care appears once per plant type, not after every item.
- No paragraph ends with a bare price, and no gift box is dismantled into a component list.
- The selection section compares real differences without restating descriptions.
- No sample explains why plants make good gifts, and none has a care section of its own.
Do not reproduce these structures sentence by sentence. Take the handling, not the shape.`;
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
- Never write "the ultimate gift", "the perfect gift", "ideal for anyone", "fits any home", "suits every style", "works in any space", "effortless", "requires no care", "thrives anywhere", "one of a kind", or "premium", "luxurious" or "high-end" unless the supplied data verifies it. A wooden planter does not make a gift eco-friendly, and nothing is "ready to gift" unless packaging and presentation are verified.
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

This column names a real BUYING DISTINCTION, as a short noun phrase. Not a personality, and not a narrated choice either: a cell beginning "Choosing..." is the reasoning leaking into the table.
  Good: "A Mother's Day message and personal note". "A larger arrangement from the family". "A compact living gift". "A hands-on terrarium project". "A romantic design with a heart-shaped planter". "A group thank-you gift".
  Bad, narrated: "Choosing a plant-focused gift without soil". "Choosing the largest arrangement in the collection".
  Bad, invented: "Someone who loves modern design". "A mother who enjoys hosting". "A coworker who needs something for a desk". "Anyone new to plants". "Someone who appreciates sculptural design". "Any occasion".
The heading may read "A good choice for" or "Best for", whichever suits the article. The table structure and the separate <th> elements never change.

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
