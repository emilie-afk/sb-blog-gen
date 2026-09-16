// Title handling. The content user no longer writes the title: the metadata call
// proposes one plus two alternatives, and this module cleans them and provides a
// deterministic fallback for when metadata generation fails.

function clean(raw) {
  return String(raw || '')
    .replace(/[—–]/g, ',')   // em and en dashes are never allowed
    .replace(/^["'\s]+|["'\s]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
}

// The year only belongs in a title when the content user asked for it.
function enforceYearRule(title, fields) {
  if (!title) return title;
  if (fields.includeYearInTitle) return title;
  return title.replace(/\s*\b(19|20)\d{2}\b\s*/g, ' ').replace(/\s+([,:])/g, '$1').replace(/\s+/g, ' ').trim();
}

function buildFallbackTitle(articleType, fields) {
  const count = fields.numberOfRecommendations;
  const year = fields.includeYearInTitle && fields.occasionYear ? ` ${fields.occasionYear}` : '';

  switch (articleType) {
    case 'care_guide':
      return `How to grow and care for ${fields.plantName}${fields.sciName ? ` (${fields.sciName})` : ''}`;
    case 'single_plant_gift':
      return fields.occasion
        ? `${fields.plantName} as a ${fields.occasion} Gift`
        : `${fields.plantName} as a Gift`;
    case 'general_gift_guide':
      return fields.recipient
        ? `${count} Plant Gift Ideas for ${fields.recipient}`
        : `${count} Plant Gift Ideas`;
    case 'occasion_gift_guide':
      return fields.recipient
        ? `${count} Plant Gifts for ${fields.recipient} for ${fields.occasion}${year}`
        : `${count} Plant Gifts for ${fields.occasion}${year}`;
    default:
      return fields.plantName ? `${fields.plantName} Guide` : 'Succulents Box Guide';
  }
}

// Returns { title, alternatives, usedFallback }.
function resolveTitles(articleType, fields, meta) {
  const proposed = enforceYearRule(clean(meta && meta.title), fields);
  const alternatives = Array.isArray(meta && meta.alternative_titles)
    ? meta.alternative_titles.map(t => enforceYearRule(clean(t), fields)).filter(Boolean).slice(0, 2)
    : [];

  // Care guides keep their established "How to grow and care for X" pattern as the
  // recommended title so the existing blog stays consistent. Any AI title becomes
  // an alternative the content user can select instead.
  if (articleType === 'care_guide') {
    const recommended = buildFallbackTitle(articleType, fields);
    const alts = [proposed, ...alternatives]
      .filter(Boolean)
      .filter(a => a.toLowerCase() !== recommended.toLowerCase())
      .slice(0, 2);
    return { title: recommended, alternatives: alts, usedFallback: false };
  }

  if (proposed) {
    return {
      title: proposed,
      alternatives: alternatives.filter(a => a.toLowerCase() !== proposed.toLowerCase()),
      usedFallback: false
    };
  }
  return { title: buildFallbackTitle(articleType, fields), alternatives, usedFallback: true };
}

module.exports = { resolveTitles, buildFallbackTitle, clean, enforceYearRule };
