/**
 * Famous-name protection for generated candidates (§12 §4).
 *
 * A generated name like "Tekken" must never be handed to a founder as a fresh,
 * available idea. The availability sources catch most of these downstream — a
 * famous brand is on GitHub, npm, Wikidata and a registered domain — but relying
 * on that alone is fragile: it costs a full sequential Quick Check to discover
 * something a static list knows instantly, and a source outage would let the
 * name slip through. So this is a fast, deterministic first gate.
 *
 * It is explicitly **not** a trademark search and does not pretend to be (§4,
 * §25). It is a curated list of names famous enough that suggesting them as
 * original would embarrass the tool, matched with the same normalization and
 * phonetic tools the rest of the product uses so near-misses ("Tekkary",
 * "Googlely") are caught too, not just exact spellings.
 */
import { levenshtein } from '@/lib/similarity/distance'
import { normalize } from '@/lib/similarity/normalize'
import { phoneticKeys } from '@/lib/similarity/phonetic'
import { leadsWithName } from '@/lib/similarity/score'

/**
 * Well-known names across the categories this product serves. Not exhaustive and
 * never will be — it is the obvious-embarrassment tier. New entries are cheap to
 * add; the goal is to catch the names a person would immediately recognise, not
 * to be a registry.
 */
const FAMOUS_NAMES: readonly string[] = [
  // Games and franchises
  'Tekken', 'Mortal Kombat', 'Street Fighter', 'Fortnite', 'Minecraft', 'Roblox', 'Zelda',
  'Mario', 'Pokemon', 'Pikachu', 'Sonic', 'Pac-Man', 'Doom', 'Halo', 'Overwatch', 'Valorant',
  'League of Legends', 'Counter-Strike', 'Call of Duty', 'Grand Theft Auto', 'FIFA', 'Tetris',
  'Among Us', 'Fall Guys', 'Genshin Impact', 'Hearthstone', 'Warcraft', 'Starcraft', 'Diablo',
  'Skyrim', 'Fallout', 'Witcher', 'Cyberpunk', 'Elden Ring', 'Dark Souls', 'Metroid', 'Kirby',
  'Splatoon', 'Animal Crossing', 'Candy Crush', 'Angry Birds', 'Clash of Clans', 'PlayStation',
  'Xbox', 'Nintendo', 'Steam', 'Twitch',
  // Tech and software
  'Google', 'Apple', 'Microsoft', 'Amazon', 'Netflix', 'Spotify', 'Stripe', 'Slack', 'Notion',
  'Figma', 'GitHub', 'GitLab', 'Docker', 'Kubernetes', 'Nvidia', 'Intel', 'Tesla', 'Uber',
  'Airbnb', 'PayPal', 'Adobe', 'Photoshop', 'Instagram', 'Facebook', 'Twitter', 'WhatsApp',
  'TikTok', 'YouTube', 'LinkedIn', 'Reddit', 'Discord', 'Zoom', 'Dropbox', 'WordPress',
  'Shopify', 'Squarespace', 'Wix', 'Firefox', 'Chrome', 'Safari', 'Android', 'Windows', 'Linux',
  'Ubuntu', 'React', 'Angular', 'Oracle', 'Salesforce', 'Cloudflare', 'Vercel', 'Netlify',
  'Heroku', 'MongoDB', 'Redis', 'Snowflake', 'Databricks', 'Datadog', 'Sentry', 'Okta', 'Twilio',
  'Zapier', 'Asana', 'Trello', 'Jira', 'Confluence', 'Miro', 'Canva', 'Grammarly', 'Duolingo',
  'Coursera', 'Udemy', 'Samsung', 'Sony', 'Bing', 'Wikipedia', 'Gmail', 'Outlook', 'Yahoo',
  'Epic Games', 'Unity', 'Unreal',
  // Finance and crypto
  'Bitcoin', 'Ethereum', 'Coinbase', 'Binance', 'Robinhood', 'Venmo', 'Klarna', 'Monzo',
  'Revolut', 'Visa', 'Mastercard', 'Plaid', 'Square',
  // Retail, food, fashion
  'Coca-Cola', 'Pepsi', 'Nike', 'Adidas', 'Gucci', 'Prada', 'Chanel', 'Rolex', 'Disney',
  'Marvel', 'Pixar', 'Starbucks', 'McDonalds', 'Subway', 'Ferrari', 'Lamborghini', 'Porsche',
  'Toyota', 'Honda', 'Ikea', 'Etsy', 'eBay', 'Alibaba', 'AliExpress', 'Temu', 'Shein', 'Zara',
  'Uniqlo', 'Supreme', 'Patagonia', 'Lululemon', 'Sephora',
  // Delivery and mobility
  'DoorDash', 'Grubhub', 'Instacart', 'Lyft', 'Deliveroo', 'Grab',
]

interface FamousEntry {
  display: string
  norm: string
  primary: string
}

const ENTRIES: readonly FamousEntry[] = FAMOUS_NAMES.map((display) => ({
  display,
  norm: normalize(display),
  primary: phoneticKeys(display).primary,
})).filter((e) => e.norm.length > 0)

export interface FamousMatch {
  /** The famous name this candidate collides with, as commonly spelled. */
  name: string
  /** How the collision was found. */
  kind: 'exact' | 'near' | 'contains'
}

/**
 * Edit-distance similarity as a 0..1 figure over the longer string. Local to
 * this module so the threshold reads in one place.
 */
function editSimilarity(a: string, b: string): number {
  const longest = Math.max(a.length, b.length)
  if (longest === 0) return 1
  return 1 - levenshtein(a, b) / longest
}

/**
 * A near match needs to be close in both spelling and length. Requiring length
 * proximity stops a short candidate from matching a long famous name just
 * because it is a substring of it.
 */
const NEAR_SIMILARITY = 0.85

/**
 * Whether a generated candidate collides with a famous name.
 *
 * Returns the first collision found, or `undefined` for a clean name. Three ways
 * to collide, strongest first:
 *
 *  - exact: same normalized form ("tekken" === "tekken").
 *  - contains: the candidate is a famous name with a short suffix bolted on
 *    ("Tekkenly", "GoogleHQ") — a squat, not an original name.
 *  - near: a small spelling change or the same phonetic key at a similar length
 *    ("Tehken", "Googel").
 */
export function famousCollision(name: string): FamousMatch | undefined {
  const norm = normalize(name)
  if (norm.length < 3) return undefined
  const primary = phoneticKeys(name).primary

  for (const entry of ENTRIES) {
    if (norm === entry.norm) return { name: entry.display, kind: 'exact' }
  }

  for (const entry of ENTRIES) {
    if (entry.norm.length < 4) continue
    // Candidate is the famous root plus a short tail: "microsofty", "googlehq".
    if (norm.length > entry.norm.length && norm.length <= entry.norm.length + 4 && norm.startsWith(entry.norm)) {
      return { name: entry.display, kind: 'contains' }
    }
    // Famous multi-word name led by the candidate's brand, or vice versa.
    if (leadsWithName(entry.display, name) || leadsWithName(name, entry.display)) {
      return { name: entry.display, kind: 'contains' }
    }
  }

  for (const entry of ENTRIES) {
    if (entry.norm.length < 4 || norm.length < 4) continue
    if (Math.abs(norm.length - entry.norm.length) > 2) continue
    const similar = editSimilarity(norm, entry.norm) >= NEAR_SIMILARITY
    const soundsAlike =
      primary !== '' && primary === entry.primary && Math.abs(norm.length - entry.norm.length) <= 1
    if (similar || soundsAlike) return { name: entry.display, kind: 'near' }
  }

  return undefined
}

/** Convenience predicate for filtering. */
export function isFamous(name: string): boolean {
  return famousCollision(name) !== undefined
}

/** Exposed for tests and diagnostics. */
export const FAMOUS_NAME_COUNT = ENTRIES.length
