// Server-side validation. The browser validates too, but nothing from the browser is
// trusted: the article type comes off an allowlist and every field is type checked,
// length capped and rebuilt into a clean object before it reaches a prompt builder.

const ARTICLE_TYPES = ['care_guide', 'single_plant_gift', 'general_gift_guide', 'occasion_gift_guide'];

const GIFT_ANGLES = ['Low maintenance', 'Beginner friendly', 'Small-space friendly', 'Desk or office gift',
  'Long-lasting alternative to flowers', 'Symbolic or meaningful', 'Eco-conscious', 'Custom angle'];
const TONES = ['Celebratory', 'Romantic', 'Appreciative', 'Professional', 'Supportive', 'Sympathy or remembrance'];
const CHARACTERISTICS = ['Low maintenance', 'Beginner friendly', 'Pet friendly', 'Low light', 'Desk friendly',
  'Small-space friendly', 'Easy to ship', 'Eco-conscious', 'Custom requirement'];

const LIMITS = {
  short: 200,
  medium: 500,
  long: 2000,
  url: 500,
  notes: 1000
};

class ValidationError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code || 'invalid_input';
  }
}

function str(value, max, label) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') throw new ValidationError(`${label} must be text.`);
  const v = value.trim();
  if (v.length > max) throw new ValidationError(`${label} is too long (max ${max} characters).`);
  return v;
}

function url(value, label) {
  const v = str(value, LIMITS.url, label);
  if (!v) return '';
  let parsed;
  try { parsed = new URL(v); } catch { throw new ValidationError(`${label} is not a valid URL.`, 'invalid_url'); }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new ValidationError(`${label} must start with http:// or https://.`, 'invalid_url');
  }
  return v;
}

function required(value, label) {
  if (!value) throw new ValidationError(`${label} is required.`, 'missing_required');
  return value;
}

function oneOf(value, allowed, label, isRequired) {
  const v = str(value, LIMITS.short, label);
  if (!v) {
    if (isRequired) throw new ValidationError(`${label} is required.`, 'missing_required');
    return '';
  }
  if (!allowed.includes(v)) throw new ValidationError(`${label} is not a recognised option.`);
  return v;
}

function manyOf(value, allowed, label) {
  if (!value) return [];
  if (!Array.isArray(value)) throw new ValidationError(`${label} must be a list.`);
  if (value.length > allowed.length) throw new ValidationError(`Too many ${label} values.`);
  return value.map(v => oneOf(v, allowed, label, false)).filter(Boolean);
}

function references(value) {
  if (!value) return [];
  if (!Array.isArray(value)) throw new ValidationError('References must be a list.');
  return value.slice(0, 2).map((r, i) => {
    const label = `Reference ${i + 1}`;
    const u = url(r && r.url, `${label} URL`);
    const t = str(r && r.text, LIMITS.short, `${label} link text`);
    if (t && !u) throw new ValidationError(`${label} has link text but no URL.`, 'missing_required');
    return u && t ? { url: u, text: t } : null;
  }).filter(Boolean);
}

function products(value) {
  if (!value) return [];
  if (!Array.isArray(value)) throw new ValidationError('Confirmed products must be a list.');
  if (value.length > 30) throw new ValidationError('Too many confirmed products (max 30).');
  return value.map((p, i) => {
    const label = `Product ${i + 1}`;
    const title = required(str(p && p.title, LIMITS.short, `${label} title`), `${label} title`);
    const u = url(p && p.url, `${label} URL`);
    if (!u) throw new ValidationError(`${label} needs a valid product URL.`, 'invalid_url');
    return {
      title,
      url: u,
      price: str(p && p.price, 40, `${label} price`),
      image: p && p.image ? url(p.image, `${label} image URL`) : '',
      productType: str(p && p.productType, LIMITS.short, `${label} product type`),
      notes: str(p && p.notes, LIMITS.notes, `${label} notes`),
      handle: str(p && p.handle, LIMITS.short, `${label} handle`),
      source: p && p.source === 'manual' ? 'manual' : 'catalog'
    };
  });
}

function count(value, label) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 30) {
    throw new ValidationError(`${label} must be a whole number between 1 and 30.`);
  }
  return n;
}

function shared(raw) {
  return {
    title: str(raw.title, LIMITS.short, 'Working title'),
    primaryKeyword: str(raw.primaryKeyword, LIMITS.short, 'Primary SEO keyword'),
    references: references(raw.references),
    additionalInstructions: str(raw.additionalInstructions, LIMITS.long, 'Additional instructions')
  };
}

function validateRequest(articleType, rawFields) {
  if (!ARTICLE_TYPES.includes(articleType)) {
    throw new ValidationError('Unknown article format.', 'invalid_article_type');
  }
  const raw = rawFields && typeof rawFields === 'object' ? rawFields : {};
  const f = shared(raw);

  if (articleType === 'care_guide') {
    f.plantName = required(str(raw.plantName, LIMITS.short, 'Plant name'), 'Plant name');
    f.sciName = str(raw.sciName, LIMITS.short, 'Scientific name');
    f.productUrl = url(raw.productUrl, 'Product URL');
    return { articleType, fields: f };
  }

  if (!f.title) throw new ValidationError('Working article title is required for gift guides.', 'missing_required');

  if (articleType === 'single_plant_gift') {
    f.plantName = required(str(raw.plantName, LIMITS.short, 'Plant name'), 'Plant name');
    f.sciName = str(raw.sciName, LIMITS.short, 'Scientific name');
    f.productUrl = url(raw.productUrl, 'Primary product URL');
    f.recipient = str(raw.recipient, LIMITS.short, 'Intended recipient');
    f.occasion = str(raw.occasion, LIMITS.short, 'Occasion');
    f.giftAngle = oneOf(raw.giftAngle, GIFT_ANGLES, 'Gift angle', true);
    f.customGiftAngle = str(raw.customGiftAngle, LIMITS.medium, 'Custom gift angle');
    if (f.giftAngle === 'Custom angle' && !f.customGiftAngle) {
      throw new ValidationError('Describe the custom gift angle.', 'missing_required');
    }
    f.careConsiderations = str(raw.careConsiderations, LIMITS.medium, 'Care considerations');
    f.productNotes = str(raw.productNotes, LIMITS.notes, 'Product facts or notes');
    return { articleType, fields: f };
  }

  // Both list formats
  f.recipient = str(raw.recipient, LIMITS.short, 'Recipient');
  f.budgetRange = str(raw.budgetRange, LIMITS.short, 'Budget range');
  f.giftCharacteristics = manyOf(raw.giftCharacteristics, CHARACTERISTICS, 'Gift characteristics');
  f.customCharacteristic = str(raw.customCharacteristic, LIMITS.medium, 'Custom requirement');
  if (f.giftCharacteristics.includes('Custom requirement') && !f.customCharacteristic) {
    throw new ValidationError('Describe the custom requirement.', 'missing_required');
  }
  f.giftCharacteristics = f.giftCharacteristics.filter(c => c !== 'Custom requirement');
  f.collectionUrl = url(raw.collectionUrl, 'Collection URL');
  f.selectedProducts = products(raw.selectedProducts);
  if (!f.selectedProducts.length) {
    throw new ValidationError('Confirm at least one product before generating a gift guide.', 'no_products');
  }
  f.numberOfRecommendations = count(raw.numberOfRecommendations, 'Number of recommendations');
  if (f.numberOfRecommendations > f.selectedProducts.length) {
    throw new ValidationError(
      `You asked for ${f.numberOfRecommendations} recommendations but only confirmed ${f.selectedProducts.length} products.`,
      'not_enough_products'
    );
  }

  if (articleType === 'occasion_gift_guide') {
    f.occasion = required(str(raw.occasion, LIMITS.short, 'Occasion name'), 'Occasion name');
    f.occasionYear = str(raw.occasionYear, 10, 'Occasion year');
    if (f.occasionYear && !/^\d{4}$/.test(f.occasionYear)) {
      throw new ValidationError('Occasion year must be a four digit year.');
    }
    f.occasionDate = str(raw.occasionDate, LIMITS.short, 'Verified occasion date');
    f.relationship = str(raw.relationship, LIMITS.short, 'Relationship');
    f.tone = oneOf(raw.tone, TONES, 'Tone', true);
    f.sensitiveOccasion = raw.sensitiveOccasion === true;
  }

  return { articleType, fields: f };
}

module.exports = { validateRequest, ValidationError, ARTICLE_TYPES, GIFT_ANGLES, TONES, CHARACTERISTICS };
