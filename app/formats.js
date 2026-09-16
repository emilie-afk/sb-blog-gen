// Declarative configuration for the four article formats.
// Everything format specific lives here: which fields show, what the button says,
// what the progress rows say, and what the reference panels are called.

const GIFT_ANGLES = ['Low maintenance', 'Beginner friendly', 'Small-space friendly', 'Desk or office gift',
  'Long-lasting alternative to flowers', 'Symbolic or meaningful', 'Eco-conscious', 'Custom angle'];
const TONES = ['Celebratory', 'Romantic', 'Appreciative', 'Professional', 'Supportive', 'Sympathy or remembrance'];
const CHARACTERISTICS = ['Low maintenance', 'Beginner friendly', 'Pet friendly', 'Low light', 'Desk friendly',
  'Small-space friendly', 'Easy to ship', 'Eco-conscious', 'Custom requirement'];

const SHARED_TAIL = [
  { name: 'primaryKeyword', type: 'text', label: 'Primary SEO keyword (optional)', placeholder: 'e.g. plant gifts for coworkers' },
  { name: 'references', type: 'references' },
  { name: 'additionalInstructions', type: 'textarea', label: 'Additional instructions (optional)', placeholder: 'Anything the writer should know: angles to avoid, facts to include, internal links to use.' }
];

const FORMATS = {
  care_guide: {
    label: 'Plant Care Guide',
    icon: '🌿',
    sectionTitle: 'Plant Info',
    buttonLabel: 'Generate Plant Care Guide',
    steps: ['Enter plant name', 'Add optional links', 'Click Generate', 'Copy HTML → Shopify'],
    progress: [
      'Writing care guide, Intro, Basic Info, Indoor/Outdoor…',
      'Writing General Care, Extra Care, Tips, Q&A, Where to Buy…',
      'Selecting matching products from catalog…',
      'Selecting related blog articles…',
      'Assembling final HTML…'
    ],
    productsPanelLabel: 'Suggested Products',
    articlesPanelLabel: 'Related Articles',
    needsProducts: false,
    fields: [
      { name: 'title', type: 'text', label: 'Working article title (optional)', placeholder: 'Leave blank to use "How to grow and care for [plant]"' },
      { name: 'plantName', type: 'text', label: 'Plant common name', required: true, placeholder: 'e.g. Haworthia, Aeonium Kiwi, String of Pearls', half: true },
      { name: 'sciName', type: 'text', label: 'Scientific name (optional)', placeholder: 'e.g. Haworthia fasciata', half: true },
      { name: 'productUrl', type: 'url', label: 'Product URL on succulentsbox.com (for buy buttons)', placeholder: 'https://succulentsbox.com/products/...' },
      ...SHARED_TAIL
    ]
  },

  single_plant_gift: {
    label: 'Single-Plant Gift Guide',
    icon: '🎁',
    sectionTitle: 'Plant Gift Info',
    buttonLabel: 'Generate Single-Plant Gift Guide',
    steps: ['Pick the plant', 'Choose a gift angle', 'Click Generate', 'Copy HTML → Shopify'],
    progress: [
      'Planning the gift angle…',
      'Writing gift and care sections…',
      'Checking product information…',
      'Selecting related articles…',
      'Assembling final HTML…'
    ],
    productsPanelLabel: 'Products Used in This Guide',
    articlesPanelLabel: 'Related Gift and Care Articles',
    needsProducts: false,
    fields: [
      { name: 'title', type: 'text', label: 'Working article title', required: true, placeholder: 'e.g. Why Snake Plants Make Great Housewarming Gifts' },
      { name: 'plantName', type: 'text', label: 'Plant common name', required: true, placeholder: 'e.g. Snake Plant', half: true },
      { name: 'sciName', type: 'text', label: 'Scientific name (optional)', placeholder: 'e.g. Dracaena trifasciata', half: true },
      { name: 'productUrl', type: 'url', label: 'Primary product URL (optional)', placeholder: 'https://succulentsbox.com/products/...' },
      { name: 'recipient', type: 'text', label: 'Intended recipient (optional)', placeholder: 'e.g. New homeowner, coworker, first-time plant parent', half: true },
      { name: 'occasion', type: 'text', label: 'Occasion (optional)', placeholder: 'e.g. Housewarming', half: true },
      { name: 'giftAngle', type: 'select', label: 'Gift angle', required: true, options: GIFT_ANGLES, placeholder: 'Choose the angle this article is built on' },
      { name: 'customGiftAngle', type: 'text', label: 'Describe the custom angle', required: true, showIf: f => f.giftAngle === 'Custom angle', placeholder: 'e.g. A plant that survives a busy nurse shift schedule' },
      { name: 'careConsiderations', type: 'textarea', label: 'Care considerations (optional)', placeholder: 'Anything the recipient must know: light needs, watering rhythm, pet toxicity.' },
      { name: 'productNotes', type: 'textarea', label: 'Product facts or notes (optional)', placeholder: 'Only confirmed facts: pot size, what ships in the box, confirmed pet safety.' },
      ...SHARED_TAIL
    ]
  },

  general_gift_guide: {
    label: 'General Gift Guide',
    icon: '🛍',
    sectionTitle: 'Gift Guide Brief',
    buttonLabel: 'Generate Gift Guide',
    steps: ['Write the title', 'Confirm the products', 'Click Generate', 'Copy HTML → Shopify'],
    progress: [
      'Reviewing confirmed products…',
      'Writing gift recommendations…',
      'Building the comparison table…',
      'Creating metadata and related content…',
      'Assembling final HTML…'
    ],
    productsPanelLabel: 'Products Used in This Guide',
    articlesPanelLabel: 'Related Gift and Care Articles',
    needsProducts: true,
    fields: [
      { name: 'title', type: 'text', label: 'Working article title', required: true, placeholder: 'e.g. 7 Low-Light Houseplant Gifts for Coworkers' },
      { name: 'recipient', type: 'text', label: 'Intended recipient (optional)', placeholder: 'e.g. Coworkers, plant-loving friend, new grad', half: true },
      { name: 'budgetRange', type: 'text', label: 'Budget range (optional)', placeholder: 'e.g. Under $25', half: true },
      { name: 'giftCharacteristics', type: 'checkboxGroup', label: 'Gift characteristics (choose any)', options: CHARACTERISTICS },
      { name: 'customCharacteristic', type: 'text', label: 'Describe the custom requirement', required: true, showIf: f => (f.giftCharacteristics || []).includes('Custom requirement'), placeholder: 'e.g. Ships flat through a mail slot' },
      { name: 'selectedProducts', type: 'products', label: 'Confirmed products', required: true },
      { name: 'numberOfRecommendations', type: 'number', label: 'Number of recommendations', required: true, min: 1, max: 30, half: true },
      { name: 'collectionUrl', type: 'url', label: 'Primary collection URL (optional)', placeholder: 'https://succulentsbox.com/collections/...', half: true },
      ...SHARED_TAIL
    ]
  },

  occasion_gift_guide: {
    label: 'Occasion Gift Guide',
    icon: '🎉',
    sectionTitle: 'Occasion Gift Guide Brief',
    buttonLabel: 'Generate Occasion Gift Guide',
    steps: ['Name the occasion', 'Confirm the products', 'Click Generate', 'Copy HTML → Shopify'],
    progress: [
      'Reviewing the occasion and audience…',
      'Writing occasion gift recommendations…',
      'Building the comparison table…',
      'Creating metadata and related content…',
      'Assembling final HTML…'
    ],
    productsPanelLabel: 'Products Used in This Guide',
    articlesPanelLabel: 'Related Gift and Care Articles',
    needsProducts: true,
    fields: [
      { name: 'title', type: 'text', label: 'Working article title', required: true, placeholder: "e.g. Best Plant Gifts for National Boss's Day 2026" },
      { name: 'occasion', type: 'text', label: 'Occasion name', required: true, placeholder: "e.g. National Boss's Day", half: true },
      { name: 'occasionYear', type: 'text', label: 'Occasion year (optional)', placeholder: 'e.g. 2026', half: true },
      { name: 'occasionDate', type: 'text', label: 'Verified occasion date (optional)', placeholder: 'e.g. October 16, 2026', hint: 'Leave blank if you have not verified it. The article will never guess a date.' },
      { name: 'recipient', type: 'text', label: 'Recipient (optional)', placeholder: 'e.g. Boss or supervisor', half: true },
      { name: 'relationship', type: 'text', label: 'Relationship (optional)', placeholder: 'e.g. Professional', half: true },
      { name: 'tone', type: 'select', label: 'Tone', required: true, options: TONES, placeholder: 'Choose the tone' },
      { name: 'giftCharacteristics', type: 'checkboxGroup', label: 'Gift characteristics (choose any)', options: CHARACTERISTICS },
      { name: 'customCharacteristic', type: 'text', label: 'Describe the custom requirement', required: true, showIf: f => (f.giftCharacteristics || []).includes('Custom requirement'), placeholder: 'e.g. Ships flat through a mail slot' },
      { name: 'selectedProducts', type: 'products', label: 'Confirmed products', required: true },
      { name: 'numberOfRecommendations', type: 'number', label: 'Number of recommendations', required: true, min: 1, max: 30, half: true },
      { name: 'budgetRange', type: 'text', label: 'Budget range (optional)', placeholder: 'e.g. Under $40', half: true },
      { name: 'collectionUrl', type: 'url', label: 'Collection or campaign URL (optional)', placeholder: 'https://succulentsbox.com/collections/...' },
      { name: 'sensitiveOccasion', type: 'checkbox', label: 'Sensitive occasion', hint: 'Sympathy, bereavement, memorials, pregnancy and infant loss, serious illness. Turns off urgency, celebration and promotional language.' },
      ...SHARED_TAIL
    ]
  }
};

const FORMAT_ORDER = ['care_guide', 'single_plant_gift', 'general_gift_guide', 'occasion_gift_guide'];
