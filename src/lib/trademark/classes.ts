/**
 * Nice classification hints.
 *
 * The Nice Agreement sorts trademarks into 45 classes — 1–34 goods, 35–45
 * services. Registry searches are far more useful when filtered to the right
 * classes, but most founders have never heard of them, so Trademark Assist
 * suggests the likely ones.
 *
 * These are **hints for a human to verify**, not a classification. Getting the
 * class right is part of what a trademark attorney is for, and the UI says so.
 */
import type { Category } from '@/lib/core/scan'

export interface NiceClass {
  code: string
  title: string
  /** Why this class is being suggested, shown to the user. */
  rationale: string
}

const CLASS_TITLES: Record<string, string> = {
  '009': 'Computer software, downloadable apps, electronic hardware',
  '016': 'Printed matter, publications, stationery',
  '018': 'Leather goods, bags, luggage',
  '025': 'Clothing, footwear, headwear',
  '028': 'Games, toys, sporting goods',
  '029': 'Meat, dairy, preserved and processed foods',
  '030': 'Coffee, tea, baked goods, confectionery',
  '032': 'Beers, soft drinks, mineral waters',
  '035': 'Advertising, business management, retail services',
  '036': 'Financial, banking, insurance and monetary services',
  '038': 'Telecommunications services',
  '041': 'Education, training, entertainment, publishing',
  '042': 'SaaS, software design and development, hosting, IT services',
  '043': 'Restaurant, catering and hospitality services',
  '044': 'Medical, veterinary and beauty services',
  '045': 'Legal and security services',
}

/**
 * Likely classes per category, most relevant first.
 *
 * Software products almost always need both 009 (the software as a good) and
 * 042 (the service of providing it) — that pair is the most common thing
 * founders miss, so it is suggested wherever software is involved.
 */
const CATEGORY_CLASSES: Record<Category, { code: string; rationale: string }[]> = {
  saas: [
    { code: '042', rationale: 'Software provided as a service is classified here.' },
    { code: '009', rationale: 'The software itself is a good in this class.' },
    { code: '035', rationale: 'Relevant if the product supports business operations.' },
  ],
  mobile_app: [
    { code: '009', rationale: 'Downloadable applications are goods in this class.' },
    { code: '042', rationale: 'Covers any hosted or backend service the app relies on.' },
    { code: '038', rationale: 'Relevant if the app carries messaging or communications.' },
  ],
  game: [
    { code: '009', rationale: 'Game software is a good in this class.' },
    { code: '041', rationale: 'Entertainment services, including online gameplay.' },
    { code: '028', rationale: 'Relevant if physical games or merchandise are planned.' },
  ],
  developer_tool: [
    { code: '009', rationale: 'Libraries, SDKs and tooling are goods in this class.' },
    { code: '042', rationale: 'Hosted developer services and APIs are classified here.' },
  ],
  business: [
    { code: '035', rationale: 'General business, advertising and management services.' },
    { code: '042', rationale: 'Relevant if the business delivers anything technical.' },
  ],
  creator_brand: [
    { code: '041', rationale: 'Entertainment and published content are classified here.' },
    { code: '009', rationale: 'Covers downloadable media and digital products.' },
    { code: '035', rationale: 'Relevant for sponsorship, promotion and merchandising.' },
  ],
  ecommerce: [
    { code: '035', rationale: 'Online retail and marketplace services.' },
    { code: '009', rationale: 'Relevant if you sell software or digital goods.' },
  ],
  fashion: [
    { code: '025', rationale: 'Clothing, footwear and headwear: the core apparel class.' },
    { code: '018', rationale: 'Bags and leather goods, if part of the range.' },
    { code: '035', rationale: 'Retail services for the products themselves.' },
  ],
  restaurant: [
    { code: '043', rationale: 'Restaurant, catering and hospitality services.' },
    { code: '030', rationale: 'Relevant if you sell packaged baked goods or drinks.' },
    { code: '029', rationale: 'Relevant if you sell packaged prepared foods.' },
  ],
  finance: [
    { code: '036', rationale: 'Financial, banking and insurance services.' },
    { code: '042', rationale: 'The software platform delivering those services.' },
    { code: '009', rationale: 'Any downloadable application you distribute.' },
  ],
  education: [
    { code: '041', rationale: 'Education and training services.' },
    { code: '009', rationale: 'Downloadable courseware and educational software.' },
    { code: '016', rationale: 'Relevant if printed materials are part of the offering.' },
  ],
  other: [
    { code: '035', rationale: 'Broad business and retail services.' },
    { code: '042', rationale: 'Relevant if anything technical is involved.' },
    { code: '009', rationale: 'Relevant if you distribute software of any kind.' },
  ],
}

/**
 * Keyword triggers that add a class regardless of category, because the
 * description reveals something the category alone does not.
 */
const DESCRIPTION_TRIGGERS: { pattern: RegExp; code: string; rationale: string }[] = [
  { pattern: /\b(payment|banking|invoice|lending|wallet|fintech)\b/i, code: '036', rationale: 'The description mentions financial activity.' },
  { pattern: /\b(course|teaching|training|tutor|learn)\b/i, code: '041', rationale: 'The description mentions education or training.' },
  { pattern: /\b(clothing|apparel|wear|shirt|hoodie)\b/i, code: '025', rationale: 'The description mentions apparel.' },
  { pattern: /\b(coffee|bakery|restaurant|kitchen|menu|food)\b/i, code: '043', rationale: 'The description mentions food service.' },
  { pattern: /\b(security|privacy|encryption|secrets|authentication)\b/i, code: '042', rationale: 'Security software services are classified here.' },
  { pattern: /\b(message|messaging|chat|call|video conferencing)\b/i, code: '038', rationale: 'The description mentions communications.' },
  { pattern: /\b(health|medical|clinic|therapy|wellness)\b/i, code: '044', rationale: 'The description mentions health services.' },
  { pattern: /\b(legal|law|compliance|contract)\b/i, code: '045', rationale: 'The description mentions legal services.' },
]

/**
 * Suggest Nice classes for a scan.
 *
 * Category supplies the baseline; the description can add classes the category
 * would miss. Order is meaningful — the first is the one to search first.
 */
export function suggestClasses(category: Category, description?: string): NiceClass[] {
  const chosen = new Map<string, NiceClass>()

  for (const { code, rationale } of CATEGORY_CLASSES[category]) {
    chosen.set(code, { code, title: CLASS_TITLES[code] ?? 'Class ' + code, rationale })
  }

  if (description !== undefined && description.trim() !== '') {
    for (const trigger of DESCRIPTION_TRIGGERS) {
      if (!trigger.pattern.test(description)) continue
      if (chosen.has(trigger.code)) continue
      chosen.set(trigger.code, {
        code: trigger.code,
        title: CLASS_TITLES[trigger.code] ?? 'Class ' + trigger.code,
        rationale: trigger.rationale,
      })
    }
  }

  return [...chosen.values()]
}

/**
 * Plain-language goods and services wording to search against.
 *
 * Registries index the goods/services text, so searching with the user's own
 * words alongside the class number materially improves what they find.
 */
export function suggestGoodsAndServices(category: Category, description?: string): string[] {
  const base: Record<Category, string[]> = {
    saas: ['software as a service', 'cloud software platform', 'computer software'],
    mobile_app: ['mobile application software', 'downloadable software application'],
    game: ['computer game software', 'entertainment services', 'online games'],
    developer_tool: ['computer software development tools', 'application programming interfaces'],
    business: ['business consultancy services', 'business management'],
    creator_brand: ['entertainment services', 'online content production', 'digital media'],
    ecommerce: ['online retail store services', 'retail services'],
    fashion: ['clothing', 'apparel', 'retail clothing services'],
    restaurant: ['restaurant services', 'food and drink catering'],
    finance: ['financial services', 'payment processing services'],
    education: ['educational services', 'training services', 'online courses'],
    other: ['business services', 'computer software'],
  }

  const terms = [...base[category]]
  if (description !== undefined && description.trim() !== '') {
    // The user's own phrasing is often the most searchable wording of all.
    terms.unshift(description.trim().toLowerCase())
  }
  return terms
}
