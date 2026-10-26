// Metadata + related recommendations prompt. One JSON response per generation:
// title and two alternatives, excerpt, meta description, related articles, and
// (care / single-plant formats only) catalog product suggestions for the panel.
//
// The instructions live in the private prompt pack. This file keeps what the
// application depends on: which formats get catalog suggestions, the article
// ranking that decides which candidates the model may see, and the candidate
// lists themselves, which are public storefront data. Whatever the model returns
// is reconciled against those lists in run-generation.js, so a model reply can
// never introduce a URL or a product of its own.
const { CATALOG } = require('../../../data/catalog.js');
const { rankArticles } = require('./rank-articles');

const CATALOG_FORMATS = ['care_guide', 'single_plant_gift'];

function subjectLine(pack, articleType, fields) {
  const part = (path, values) => pack.render(`metadata.subject.part.${path}`, values || {});
  switch (articleType) {
    case 'care_guide':
      return pack.render('metadata.subject.careGuide', {
        plantName: fields.plantName,
        sciSuffix: fields.sciName ? ` (${fields.sciName})` : ''
      });
    case 'single_plant_gift':
      return pack.render('metadata.subject.singlePlantGift', {
        plantName: fields.plantName,
        angle: fields.giftAngle === 'Custom angle' ? fields.customGiftAngle : fields.giftAngle,
        recipientPart: fields.recipient ? part('recipient', { recipient: fields.recipient }) : '',
        occasionPart: fields.occasion ? part('occasion', { occasion: fields.occasion }) : ''
      });
    case 'general_gift_guide':
      return pack.render('metadata.subject.generalGiftGuide', {
        count: fields.numberOfRecommendations,
        recipientPart: fields.recipient ? part('recipient', { recipient: fields.recipient }) : part('noRecipient'),
        characteristicsPart: (fields.giftCharacteristics || []).length
          ? part('characteristics', { characteristics: fields.giftCharacteristics.join(', ') })
          : '',
        budgetPart: fields.budgetRange ? part('budget', { budget: fields.budgetRange }) : ''
      });
    case 'occasion_gift_guide':
      return pack.render('metadata.subject.occasionGiftGuide', {
        count: fields.numberOfRecommendations,
        occasion: fields.occasion,
        recipientPart: fields.recipient ? part('recipient', { recipient: fields.recipient }) : '',
        relationshipPart: fields.relationship ? part('relationship', { relationship: fields.relationship }) : '',
        sensitivePart: fields.sensitiveOccasion ? part('sensitive') : ''
      });
    default:
      return pack.get('metadata.subject.fallback');
  }
}

function productLines(pack, fields) {
  const products = (fields.selectedProducts || []).slice(0, fields.numberOfRecommendations || undefined);
  if (!products.length) return '';
  return pack.render('metadata.productLines', {
    count: products.length,
    list: products.map((p, i) => `${i + 1}. ${p.title}`).join('\n')
  });
}

function titleRules(pack, articleType, fields) {
  const isList = articleType === 'general_gift_guide' || articleType === 'occasion_gift_guide';
  const withYear = articleType === 'occasion_gift_guide' && fields.includeYearInTitle && fields.occasionYear;
  return pack.render('metadata.titleRules', {
    countRule: isList
      ? pack.render('metadata.titleCountRule', { count: fields.numberOfRecommendations })
      : pack.get('metadata.titleNoCountRule'),
    yearRule: withYear
      ? pack.render('metadata.titleYearRule', { year: fields.occasionYear })
      : pack.get('metadata.titleNoYearRule'),
    keywordRule: fields.primaryKeyword
      ? pack.render('metadata.titleKeywordRule', { keyword: fields.primaryKeyword })
      : '',
    directionRule: fields.titleDirection
      ? pack.render('metadata.titleDirectionRule', { direction: fields.titleDirection })
      : ''
  });
}

function buildMetadataAndRelatedPrompt(articleType, fields, pack) {
  const wantsCatalog = CATALOG_FORMATS.includes(articleType);
  const articles = rankArticles(articleType, fields, 80);
  const articlesStr = articles.map(a => `${a.t}|${a.u}`).join('\n');
  const catalogStr = wantsCatalog
    ? CATALOG.map(p => `${p.t}|${p.h}|${p.p}|${p.i}|${p.cat}`).join('\n')
    : '';

  const sensitive = articleType === 'occasion_gift_guide' && fields.sensitiveOccasion;

  const productRule = wantsCatalog
    ? pack.render('metadata.productRule.wrapper', {
        rule: pack.render(
          articleType === 'care_guide' ? 'metadata.productRule.careGuide' : 'metadata.productRule.singlePlant',
          { plantName: fields.plantName }
        )
      })
    : '';

  const relatedRule = articleType === 'care_guide'
    ? pack.render('metadata.relatedRule.careGuide', { plantName: fields.plantName })
    : pack.get('metadata.relatedRule.gift');

  return pack.render('metadata.document', {
    subject: subjectLine(pack, articleType, fields),
    productLines: productLines(pack, fields),
    shape: pack.get(wantsCatalog ? 'metadata.shape.withCatalog' : 'metadata.shape.withoutCatalog'),
    titleRules: titleRules(pack, articleType, fields),
    sensitiveRule: sensitive ? pack.get('metadata.sensitiveRule') : '',
    productRule,
    relatedRule,
    catalogBlock: catalogStr ? pack.render('metadata.catalogBlock', { catalog: catalogStr }) : '',
    articles: articlesStr
  });
}

module.exports = { buildMetadataAndRelatedPrompt, CATALOG_FORMATS };
