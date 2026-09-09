/**
 * Industry taxonomy (§18).
 *
 * A shallow two-level tree — sector → industry — used to answer one question:
 * *does this match operate anywhere near what the user is building?*
 *
 * ENVRYN CLOTHING and ENVIRON SECURITY SOFTWARE are equally similar as strings.
 * They are not equally important to somebody naming a cybersecurity product, and
 * §18 is explicit that treating them the same is a failure. This taxonomy is how
 * the product tells them apart.
 *
 * Deliberately keyword-driven rather than embedding-driven: embeddings cost
 * money per call and would make a core scoring input depend on an external
 * service being up. Keywords are free, deterministic, inspectable, and testable
 * — and when the user supplies a description, an optional LLM pass can map free
 * text onto these same nodes without ever becoming load-bearing.
 */
import type { Category } from '@/lib/core/scan'

export const SECTORS = [
  'software',
  'commerce',
  'services',
  'media',
  'industrial',
] as const

export type Sector = (typeof SECTORS)[number]

export interface IndustryNode {
  id: string
  label: string
  sector: Sector
  /**
   * Terms that indicate this industry. Matched case-insensitively on word
   * boundaries, so "app" does not fire on "apparel".
   */
  keywords: string[]
}

/**
 * ~40 nodes. Breadth matters more than depth here: the score only needs to know
 * "same thing / neighbouring thing / unrelated thing", and a deeper tree would
 * demand classification precision the keyword approach cannot honestly deliver.
 */
export const INDUSTRIES: IndustryNode[] = [
  // ── software ────────────────────────────────────────────────────────────
  {
    id: 'dev_tools',
    label: 'Developer tools',
    sector: 'software',
    keywords: ['sdk', 'api', 'library', 'framework', 'compiler', 'cli', 'developer tool', 'developer', 'package', 'runtime', 'ide', 'debugger', 'open source', 'bindings', 'client library'],
  },
  {
    id: 'security',
    label: 'Security & privacy',
    sector: 'software',
    keywords: ['security', 'cybersecurity', 'encryption', 'secrets', 'password', 'authentication', 'firewall', 'vulnerability', 'privacy', 'vpn', 'threat', 'malware', 'identity', 'secure'],
  },
  {
    id: 'devops',
    label: 'DevOps & infrastructure',
    sector: 'software',
    keywords: ['devops', 'kubernetes', 'container', 'deployment', 'ci/cd', 'infrastructure', 'hosting', 'cloud', 'server', 'monitoring', 'observability', 'orchestration'],
  },
  {
    id: 'data',
    label: 'Data & analytics',
    sector: 'software',
    keywords: ['analytics', 'database', 'data warehouse', 'etl', 'business intelligence', 'dashboard', 'metrics', 'reporting', 'query', 'sql'],
  },
  {
    id: 'ai',
    label: 'AI & machine learning',
    sector: 'software',
    keywords: ['artificial intelligence', 'machine learning', 'neural', 'llm', 'model', 'inference', 'training', 'chatbot', 'generative'],
  },
  {
    id: 'productivity',
    label: 'Productivity software',
    sector: 'software',
    keywords: ['productivity', 'task', 'todo', 'notes', 'calendar', 'workflow', 'project management', 'collaboration', 'document', 'spreadsheet'],
  },
  {
    id: 'communication',
    label: 'Communication software',
    sector: 'software',
    keywords: ['messaging', 'chat', 'email', 'video call', 'conferencing', 'voip', 'sms', 'notification'],
  },
  {
    id: 'design_tools',
    label: 'Design tools',
    sector: 'software',
    keywords: ['design', 'prototyping', 'wireframe', 'graphics', 'illustration', 'photo editing', 'ui kit', 'font'],
  },
  {
    id: 'gaming',
    label: 'Games',
    sector: 'software',
    keywords: ['game', 'gaming', 'puzzle', 'rpg', 'multiplayer', 'arcade', 'esports', 'console', 'gameplay'],
  },
  {
    id: 'fintech_software',
    label: 'Financial software',
    sector: 'software',
    keywords: ['fintech', 'payment', 'payments', 'payment processing', 'billing', 'invoicing', 'accounting software', 'payroll', 'expense', 'checkout', 'merchant', 'transaction'],
  },
  {
    id: 'healthtech',
    label: 'Health technology',
    sector: 'software',
    keywords: ['health app', 'fitness', 'telemedicine', 'patient', 'medical software', 'wellness app', 'mental health'],
  },
  {
    id: 'edtech',
    label: 'Education technology',
    sector: 'software',
    keywords: ['edtech', 'learning platform', 'course', 'lms', 'quiz', 'flashcard', 'tutoring app'],
  },
  {
    id: 'martech',
    label: 'Marketing technology',
    sector: 'software',
    keywords: ['marketing automation', 'crm', 'seo', 'email campaign', 'lead generation', 'ad platform', 'attribution'],
  },

  // ── commerce ────────────────────────────────────────────────────────────
  {
    id: 'retail',
    label: 'Retail',
    sector: 'commerce',
    keywords: ['retail', 'shop', 'store', 'ecommerce', 'e-commerce', 'online store', 'merchandise', 'consumer goods'],
  },
  {
    id: 'marketplace',
    label: 'Marketplace',
    sector: 'commerce',
    keywords: ['marketplace', 'classifieds', 'auction', 'peer-to-peer', 'listings', 'sellers', 'buyers'],
  },
  {
    id: 'fashion',
    label: 'Fashion & apparel',
    sector: 'commerce',
    keywords: ['clothing', 'apparel', 'fashion', 'footwear', 'shoes', 'jewellery', 'jewelry', 'accessories', 'streetwear', 'garment', 'textile'],
  },
  {
    id: 'beauty',
    label: 'Beauty & cosmetics',
    sector: 'commerce',
    keywords: ['cosmetics', 'skincare', 'beauty', 'makeup', 'fragrance', 'perfume', 'haircare', 'salon'],
  },
  {
    id: 'food_products',
    label: 'Food & beverage products',
    sector: 'commerce',
    keywords: ['food', 'beverage', 'snack', 'drink', 'coffee', 'tea', 'brewery', 'bakery', 'confectionery', 'grocery'],
  },
  {
    id: 'home_goods',
    label: 'Home & furniture',
    sector: 'commerce',
    keywords: ['furniture', 'homeware', 'interior', 'decor', 'kitchenware', 'bedding', 'appliance'],
  },

  // ── services ────────────────────────────────────────────────────────────
  {
    id: 'banking',
    label: 'Banking & finance',
    sector: 'services',
    keywords: ['bank', 'banking', 'lending', 'mortgage', 'investment', 'brokerage', 'wealth', 'capital', 'credit union', 'trading', 'financial services', 'finance company'],
  },
  {
    id: 'insurance',
    label: 'Insurance',
    sector: 'services',
    keywords: ['insurance', 'underwriting', 'policyholder', 'claims', 'actuarial', 'reinsurance'],
  },
  {
    id: 'legal',
    label: 'Legal services',
    sector: 'services',
    keywords: ['legal', 'law firm', 'attorney', 'solicitor', 'litigation', 'compliance', 'paralegal'],
  },
  {
    id: 'consulting',
    label: 'Consulting',
    sector: 'services',
    keywords: ['consulting', 'consultancy', 'advisory', 'strategy firm', 'management consulting'],
  },
  {
    id: 'healthcare',
    label: 'Healthcare services',
    sector: 'services',
    keywords: ['clinic', 'hospital', 'physician', 'dental', 'therapy', 'pharmacy', 'veterinary', 'medical practice'],
  },
  {
    id: 'education',
    label: 'Education',
    sector: 'services',
    keywords: ['school', 'university', 'college', 'academy', 'training', 'tuition', 'curriculum', 'teaching'],
  },
  {
    id: 'real_estate',
    label: 'Real estate',
    sector: 'services',
    keywords: ['real estate', 'property', 'realtor', 'letting', 'rental', 'landlord', 'estate agent'],
  },
  {
    id: 'logistics',
    label: 'Logistics & delivery',
    sector: 'services',
    keywords: ['logistics', 'shipping', 'freight', 'courier', 'delivery', 'warehouse', 'supply chain', 'fulfilment', 'fulfillment'],
  },
  {
    id: 'travel',
    label: 'Travel & hospitality',
    sector: 'services',
    keywords: ['travel', 'hotel', 'booking', 'flight', 'tourism', 'holiday', 'accommodation', 'hostel', 'resort'],
  },
  {
    id: 'restaurant',
    label: 'Restaurants & food service',
    sector: 'services',
    keywords: ['restaurant', 'cafe', 'catering', 'dining', 'menu', 'kitchen', 'takeaway', 'bistro', 'bar'],
  },

  // ── media ───────────────────────────────────────────────────────────────
  {
    id: 'entertainment',
    label: 'Entertainment',
    sector: 'media',
    keywords: ['entertainment', 'film', 'movie', 'cinema', 'television', 'studio', 'production company'],
  },
  {
    id: 'publishing',
    label: 'Publishing',
    sector: 'media',
    keywords: ['publishing', 'magazine', 'newspaper', 'book', 'journal', 'editorial', 'newsletter'],
  },
  {
    id: 'music',
    label: 'Music',
    sector: 'media',
    keywords: ['music', 'record label', 'album', 'artist', 'audio', 'podcast', 'streaming music', 'band'],
  },
  {
    id: 'video',
    label: 'Video & streaming',
    sector: 'media',
    keywords: ['video', 'streaming', 'channel', 'creator', 'vlog', 'broadcast', 'youtube'],
  },
  {
    id: 'social',
    label: 'Social media',
    sector: 'media',
    keywords: ['social network', 'social media', 'community platform', 'forum', 'feed', 'followers'],
  },
  {
    id: 'advertising',
    label: 'Advertising',
    sector: 'media',
    keywords: ['advertising', 'agency', 'branding', 'campaign', 'media buying', 'public relations'],
  },

  // ── industrial ──────────────────────────────────────────────────────────
  {
    id: 'manufacturing',
    label: 'Manufacturing',
    sector: 'industrial',
    keywords: ['manufacturing', 'factory', 'industrial', 'machinery', 'fabrication', 'assembly', 'tooling'],
  },
  {
    id: 'energy',
    label: 'Energy & utilities',
    sector: 'industrial',
    keywords: ['energy', 'solar', 'renewable', 'oil', 'gas', 'electricity', 'utility', 'battery', 'power'],
  },
  {
    id: 'agriculture',
    label: 'Agriculture',
    sector: 'industrial',
    keywords: ['agriculture', 'farming', 'crop', 'livestock', 'agri', 'harvest', 'seed'],
  },
  {
    id: 'automotive',
    label: 'Automotive',
    sector: 'industrial',
    keywords: ['automotive', 'vehicle', 'car', 'motor', 'ev', 'automobile', 'fleet'],
  },
  {
    id: 'construction',
    label: 'Construction',
    sector: 'industrial',
    keywords: ['construction', 'builder', 'contractor', 'architecture', 'engineering firm', 'civil'],
  },
  {
    id: 'telecom',
    label: 'Telecommunications',
    sector: 'industrial',
    keywords: ['telecom', 'telecommunications', 'network operator', 'broadband', 'mobile network', 'fibre', 'fiber'],
  },
]

const BY_ID = new Map(INDUSTRIES.map((n) => [n.id, n]))

export function industryById(id: string): IndustryNode | undefined {
  return BY_ID.get(id)
}

/**
 * The industries a scan category implies before any description is read.
 *
 * A category is a weak signal on its own — "SaaS" spans security, analytics and
 * marketing — so several nodes are seeded and the description is what sharpens
 * it. Where a category maps to nothing specific, seeding nothing is correct:
 * inventing an industry would be worse than admitting we do not know.
 */
export const CATEGORY_INDUSTRIES: Record<Category, string[]> = {
  saas: ['productivity', 'data', 'devops', 'dev_tools'],
  mobile_app: ['productivity', 'communication'],
  game: ['gaming', 'entertainment'],
  developer_tool: ['dev_tools', 'devops'],
  business: ['consulting'],
  creator_brand: ['video', 'social', 'entertainment'],
  ecommerce: ['retail', 'marketplace'],
  fashion: ['fashion', 'retail'],
  restaurant: ['restaurant', 'food_products'],
  finance: ['banking', 'fintech_software'],
  education: ['education', 'edtech'],
  // No signal at all. Deliberately empty.
  other: [],
}
