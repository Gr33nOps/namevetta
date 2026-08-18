/**
 * Cross-category coverage.
 *
 * Scoring weights, seeded industries and relevance all vary by category, so a
 * dataset that only exercised SaaS would leave eleven other code paths
 * unmeasured. Each category gets the same three shapes:
 *
 *  1. an exact collision in its own field  — must be caught
 *  2. the same name in an unrelated field  — must be damped
 *  3. a near-miss spelling in its own field — must be caught
 */
import type { Category } from '@/lib/core/scan'
import type { GoldenCase } from './types'

interface CategoryProfile {
  category: Category
  /** What the user is building. */
  description: string
  /** A description that places a match squarely in the same field. */
  sameField: string
  /** A description from a field that should score as unrelated. */
  otherField: string
  candidate: string
  /** A one-letter-off version of the candidate. */
  nearMiss: string
}

const PROFILES: CategoryProfile[] = [
  {
    category: 'saas',
    description: 'Cloud software platform for business analytics',
    sameField: 'Business intelligence and analytics dashboard software',
    otherField: 'Artisan bakery and coffee roastery',
    candidate: 'Metrika',
    nearMiss: 'Metrike',
  },
  {
    category: 'mobile_app',
    description: 'Downloadable mobile application for messaging',
    sameField: 'Mobile messaging and chat application',
    otherField: 'Industrial machinery manufacturing',
    candidate: 'Chatly',
    nearMiss: 'Chatlie',
  },
  {
    category: 'game',
    description: 'Indie puzzle game for console and mobile',
    sameField: 'Computer game software and online gameplay',
    otherField: 'Commercial insurance underwriting services',
    candidate: 'Puzzlon',
    nearMiss: 'Puzzlen',
  },
  {
    category: 'developer_tool',
    description: 'Open source SDK and command line tooling',
    sameField: 'Developer SDK, API bindings and client library',
    otherField: 'Restaurant catering and dining services',
    candidate: 'Buildkit',
    nearMiss: 'Buildkyt',
  },
  {
    category: 'business',
    description: 'Management consulting and advisory firm',
    sameField: 'Business consultancy and strategy advisory',
    otherField: 'Computer game software studio',
    candidate: 'Northvale',
    nearMiss: 'Northvail',
  },
  {
    category: 'creator_brand',
    description: 'Online video channel and published content',
    sameField: 'Video streaming channel and content creator',
    otherField: 'Solar energy and renewable power utility',
    candidate: 'Pixelvue',
    nearMiss: 'Pixelvu',
  },
  {
    category: 'ecommerce',
    description: 'Online retail store selling consumer goods',
    sameField: 'Online retail store and e-commerce marketplace',
    otherField: 'Hospital and medical clinic services',
    candidate: 'Shoply',
    nearMiss: 'Shoplie',
  },
  {
    category: 'fashion',
    description: 'Clothing and streetwear apparel label',
    sameField: 'Clothing, footwear and apparel brand',
    otherField: 'Cloud infrastructure and container hosting',
    candidate: 'Threadle',
    nearMiss: 'Thredle',
  },
  {
    category: 'restaurant',
    description: 'Neighbourhood restaurant and cafe',
    sameField: 'Restaurant, cafe and catering services',
    otherField: 'Machine learning and neural network platform',
    candidate: 'Fernbrook',
    nearMiss: 'Fernbrooke',
  },
  {
    category: 'finance',
    description: 'Banking and investment services platform',
    sameField: 'Banking, lending and investment services',
    otherField: 'Clothing and footwear retailer',
    candidate: 'Capitalis',
    nearMiss: 'Capitallis',
  },
  {
    category: 'education',
    description: 'Online learning platform and courses',
    sameField: 'Educational training services and online courses',
    otherField: 'Freight logistics and warehouse fulfilment',
    candidate: 'Learnova',
    nearMiss: 'Learnovah',
  },
  {
    category: 'other',
    description: 'Computer security and encryption software',
    sameField: 'Cybersecurity and encryption software vendor',
    otherField: 'Agricultural farming and crop production',
    candidate: 'Cipherly',
    nearMiss: 'Cypherly',
  },
]

export const CROSS_CATEGORY_CASES: GoldenCase[] = PROFILES.flatMap((p): GoldenCase[] => [
  {
    id: `cat-${p.category}-exact`,
    kind: 'conflict',
    candidate: p.candidate,
    category: p.category,
    description: p.description,
    match: p.candidate,
    matchDescription: p.sameField,
    legallyWeighted: true,
    expect: { minOverall: 95, minIndustry: 60, severityAtLeast: 'critical' },
    tags: ['cross-category', 'exact', 'same-industry', p.category],
    note: `Exact collision within ${p.category}. Must reach critical.`,
  },
  {
    id: `cat-${p.category}-unrelated`,
    kind: 'clear',
    candidate: p.candidate,
    category: p.category,
    description: p.description,
    match: p.candidate,
    matchDescription: p.otherField,
    legallyWeighted: true,
    expect: { maxIndustry: 35, severityAtMost: 'high' },
    tags: ['cross-category', 'unrelated-industry', p.category],
    note: `Same name in a field unrelated to ${p.category}. Must be damped below critical.`,
  },
  {
    id: `cat-${p.category}-near`,
    kind: 'conflict',
    candidate: p.candidate,
    category: p.category,
    description: p.description,
    match: p.nearMiss,
    matchDescription: p.sameField,
    legallyWeighted: true,
    expect: { minOverall: 60, severityAtLeast: 'medium' },
    tags: ['cross-category', 'near-miss', 'same-industry', p.category],
    note: `Near-miss spelling within ${p.category}. Must not be dismissed.`,
  },
])

/**
 * Source-shaped cases.
 *
 * These carry the `categories` a real adapter would attach — an App Store
 * genre, an npm ecosystem tag — because those are a stronger classification
 * signal than prose and are handled by a separate code path.
 */
export const SOURCE_SHAPED_CASES: GoldenCase[] = [
  {
    id: 'src-appstore-001',
    kind: 'conflict',
    candidate: 'Chatly',
    category: 'mobile_app',
    description: 'Mobile messaging application',
    match: 'Chatly',
    matchCategories: ['Social Networking'],
    legallyWeighted: false,
    expect: { minOverall: 95, severityAtLeast: 'high' },
    tags: ['source-shaped', 'app-store'],
    note: 'App Store genre classifies the match without any description text.',
  },
  {
    id: 'src-appstore-002',
    kind: 'clear',
    candidate: 'Cipherly',
    category: 'saas',
    description: 'Encryption and security software',
    match: 'Cipherly',
    matchCategories: ['Games'],
    legallyWeighted: false,
    expect: { maxIndustry: 35, severityAtMost: 'high' },
    tags: ['source-shaped', 'app-store', 'unrelated-industry'],
    note: 'A game with the same name is not a security competitor.',
  },
  {
    id: 'src-npm-001',
    kind: 'conflict',
    candidate: 'Buildkit',
    category: 'developer_tool',
    description: 'Command line build tooling',
    match: 'buildkit',
    matchCategories: ['npm'],
    legallyWeighted: false,
    expect: { minOverall: 95, minIndustry: 50, severityAtLeast: 'high' },
    tags: ['source-shaped', 'npm', 'same-industry'],
    note: 'An npm package name is a developer-tools signal by itself.',
  },
  {
    id: 'src-repo-001',
    kind: 'conflict',
    candidate: 'Metrika',
    category: 'developer_tool',
    description: 'Analytics SDK for applications',
    match: 'metrika',
    matchCategories: ['repository'],
    legallyWeighted: false,
    expect: { minOverall: 95, severityAtLeast: 'high' },
    tags: ['source-shaped', 'github', 'same-industry'],
    note: 'A GitHub repository holding the exact namespace.',
  },
  {
    id: 'src-edgar-001',
    kind: 'conflict',
    candidate: 'Capitalis',
    category: 'finance',
    description: 'Banking and investment platform',
    match: 'Capitalis Inc.',
    matchDescription: 'Banking and financial services',
    matchCategories: ['sec-filer'],
    legallyWeighted: true,
    expect: { minIndustry: 60, severityAtLeast: 'medium' },
    tags: ['source-shaped', 'edgar', 'same-industry'],
    note: 'A registered financial company with a corporate suffix.',
  },
]
