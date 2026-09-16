// Ranks the Succulents Box article index so the metadata prompt only sees plausible
// candidates. Care guides keep the original plant-name scoring. Gift guides score on
// occasion, recipient, gift constraint, plant or product type, then care content.
const { ARTICLES } = require('../../../data/articles.js');

function tokens(s) {
  return String(s || '').toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 3);
}

function rankForCareGuide(fields, limit = 80) {
  const plantName = String(fields.plantName || '');
  const keywords = tokens(plantName);
  const genus = keywords[0] || '';
  return ARTICLES.map(a => {
    const hay = (a.t + ' ' + a.u).toLowerCase();
    let score = 0;
    const slug = a.u.split('/blogs/blog/')[1] || '';
    if (plantName && slug.includes(plantName.toLowerCase().replace(/\s+/g, '-'))) score += 100;
    if (genus && hay.includes(genus)) score += 20;
    keywords.forEach(k => { if (hay.includes(k)) score += 5; });
    if (hay.includes('care') || hay.includes('propagat') || hay.includes('water')) score += 1;
    return { a, score };
  }).sort((x, y) => y.score - x.score).slice(0, limit).map(r => r.a);
}

function rankForGiftGuide(fields, limit = 80) {
  const occasion = tokens(fields.occasion);
  const recipient = tokens(fields.recipient);
  const constraints = tokens([].concat(fields.giftCharacteristics || [], fields.customCharacteristic || '', fields.giftAngle || '', fields.customGiftAngle || '').join(' '));
  const plants = tokens([fields.plantName, fields.sciName].concat((fields.selectedProducts || []).map(p => p.title)).join(' '));
  const titleWords = tokens(fields.title);

  return ARTICLES.map(a => {
    const hay = (a.t + ' ' + a.u).toLowerCase();
    let score = 0;
    if (hay.includes('gift') || hay.includes('present')) score += 12;
    occasion.forEach(k => { if (hay.includes(k)) score += 30; });
    recipient.forEach(k => { if (hay.includes(k)) score += 18; });
    constraints.forEach(k => { if (hay.includes(k)) score += 10; });
    plants.forEach(k => { if (hay.includes(k)) score += 8; });
    titleWords.forEach(k => { if (hay.includes(k)) score += 3; });
    // Complementary care content is a fallback, never a priority.
    if (hay.includes('care') || hay.includes('beginner') || hay.includes('indoor')) score += 2;
    if (hay.includes('propagat')) score -= 3;
    return { a, score };
  }).sort((x, y) => y.score - x.score).slice(0, limit).map(r => r.a);
}

function rankArticles(articleType, fields, limit) {
  return articleType === 'care_guide'
    ? rankForCareGuide(fields, limit)
    : rankForGiftGuide(fields, limit);
}

module.exports = { rankArticles };
