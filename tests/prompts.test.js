// Validation and prompt-builder suite. Run: node tests/prompts.test.js
process.chdir(require('path').join(__dirname, '..'));
const { validateRequest, ValidationError } = require('../netlify/functions/lib/validate');
const { buildCareGuidePrompt } = require('../netlify/functions/lib/prompt-care-guide');
const { buildSinglePlantGiftPrompt } = require('../netlify/functions/lib/prompt-single-plant-gift');
const { buildGeneralGiftGuidePrompt } = require('../netlify/functions/lib/prompt-general-gift-guide');
const { buildOccasionGiftGuidePrompt } = require('../netlify/functions/lib/prompt-occasion-gift-guide');
const { buildMetadataAndRelatedPrompt } = require('../netlify/functions/lib/prompt-metadata-related');

function ok(name, fn) { try { const r = fn(); console.log('PASS', name); return r; } catch(e){ console.log('FAIL', name, '::', e.message); } }
function expectFail(name, code, fn) {
  try { fn(); console.log('FAIL', name, ':: expected error'); }
  catch(e){ console.log(e.code === code ? 'PASS' : 'FAIL', name, '::', e.code, e.message); }
}

// care guide
const care = ok('care valid', () => validateRequest('care_guide', { plantName: 'Haworthia', sciName:'Haworthia fasciata', productUrl:'https://succulentsbox.com/products/haworthia', references:[{url:'https://aspca.org',text:'ASPCA'}] }));
console.log('  care prompt len', buildCareGuidePrompt(care.fields).length);
console.log('  care meta prompt len', buildMetadataAndRelatedPrompt('care_guide', care.fields).length);
console.log('  title default path ok:', /Basic Information/.test(buildCareGuidePrompt(care.fields)));
expectFail('care missing plant', 'missing_required', () => validateRequest('care_guide', {}));
expectFail('bad article type', 'invalid_article_type', () => validateRequest('nope', {}));
expectFail('bad url', 'invalid_url', () => validateRequest('care_guide', { plantName:'X', productUrl:'javascript:alert(1)' }));
expectFail('ref text no url', 'missing_required', () => validateRequest('care_guide', { plantName:'X', references:[{text:'hi'}] }));

// single plant
const spg = ok('single plant valid', () => validateRequest('single_plant_gift', { plantName:'Snake Plant', giftAngle:'Low maintenance' }));
console.log('  spg prompt has angle:', /Low maintenance/.test(buildSinglePlantGiftPrompt(spg.fields)));
ok('spg valid without a title', () => validateRequest('single_plant_gift', { plantName:'X', giftAngle:'Low maintenance' }));
expectFail('spg custom angle empty', 'missing_required', () => validateRequest('single_plant_gift', { plantName:'X', giftAngle:'Custom angle' }));

// general
const prods = [1,2,3].map(i => ({ title:'Product '+i, url:'https://succulentsbox.com/products/p'+i, price:'$'+i+'.00', source:'catalog', handle:'p'+i }));
const gg = ok('general valid', () => validateRequest('general_gift_guide', { numberOfRecommendations:3, selectedProducts:prods, giftCharacteristics:['Low light','Desk friendly'] }));
const ggp = buildGeneralGiftGuidePrompt(gg.fields);
console.log('  general exact count:', /exactly 3 recommendations/.test(ggp), '| lists products:', /Product 3/.test(ggp));
expectFail('general no products', 'no_products', () => validateRequest('general_gift_guide', { numberOfRecommendations:3, selectedProducts:[] }));
expectFail('general recs above the cap', 'invalid_input', () => validateRequest('general_gift_guide', { numberOfRecommendations:15, selectedProducts:prods }));
expectFail('general more recs than confirmed products', 'not_enough_products', () => validateRequest('general_gift_guide', { numberOfRecommendations:5, selectedProducts:prods }));
expectFail('manual product bad url', 'invalid_url', () => validateRequest('general_gift_guide', { numberOfRecommendations:1, selectedProducts:[{title:'Box', url:'not-a-url'}] }));

// occasion
const og = ok('occasion valid', () => validateRequest('occasion_gift_guide', { occasion:"National Boss's Day", occasionYear:'2026', occasionDate:'October 16, 2026', numberOfRecommendations:3, selectedProducts:prods }));
const ogp = buildOccasionGiftGuidePrompt(og.fields);
console.log('  occasion uses supplied date:', /October 16, 2026/.test(ogp), '| forbids guessing:', /Never guess or compute the date/.test(ogp));
const og2 = validateRequest('occasion_gift_guide', { occasion:'Pregnancy and Infant Loss Remembrance Day', numberOfRecommendations:2, selectedProducts:prods.slice(0,2), sensitiveOccasion:true, collectionUrl:'https://succulentsbox.com/collections/all' });
const ogp2 = buildOccasionGiftGuidePrompt(og2.fields);
console.log('  no-date rule:', /NO DATE WAS SUPPLIED/.test(ogp2), '| sensitive on:', /SENSITIVE OCCASION MODE IS ON/.test(ogp2), '| no cta button:', !/border-radius:6px;font-weight:700/.test(ogp2));

// meta prompts for all
['care_guide','single_plant_gift','general_gift_guide','occasion_gift_guide'].forEach(t => {
  const f = t==='care_guide'?care.fields : t==='single_plant_gift'?spg.fields : t==='general_gift_guide'?gg.fields:og.fields;
  const p = buildMetadataAndRelatedPrompt(t, f);
  console.log('  meta', t, 'len', p.length, '| catalog included:', /PRODUCTS \(title/.test(p));
});

// em dash check in built prompts
const all = [buildCareGuidePrompt(care.fields), buildSinglePlantGiftPrompt(spg.fields), ggp, ogp].join('');
console.log('prompt instruction blocks present:', /Never use em dashes/.test(all));
