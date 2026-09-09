/**
 * UK SIC 2007 → industry taxonomy.
 *
 * Companies House is the only source that hands us a *declared*, structured
 * industry code rather than free text we have to guess from. That matters more
 * than it sounds: without an industry signal, industry relevance is `undefined`,
 * and `severityFor` deliberately refuses to escalate a match it cannot place in
 * a field. So an active UK bank registered under your exact name read as a weak
 * conflict purely because we had nothing to classify it with.
 *
 * SIC codes are five digits; the leading two are the division and carry almost
 * all of the meaning. This maps divisions, with specific five-digit overrides
 * only where the division is genuinely too coarse — "58 publishing" covers both
 * novels and computer games, which belong in different taxonomy nodes.
 */

/** Five-digit codes whose division would classify them wrongly. */
const EXACT: Record<string, string> = {
  '20420': 'beauty',      // perfumes and toilet preparations
  '46420': 'fashion',     // wholesale of clothing and footwear
  '47710': 'fashion',     // retail of clothing
  '47721': 'fashion',     // retail of footwear
  '47750': 'beauty',      // retail of cosmetics
  '47910': 'marketplace', // mail order / internet retail
  '58210': 'gaming',      // publishing of computer games
  '58290': 'dev_tools',   // other software publishing
  '62011': 'dev_tools',   // ready-made software development
  '62012': 'dev_tools',   // business and domestic software development
  '63110': 'data',        // data processing, hosting
  '63120': 'social',      // web portals
  '64191': 'banking',     // banks
  '72110': 'healthcare',  // biotechnology R&D
  '74100': 'design_tools',// specialised design
  '74201': 'video',       // portrait photography
  '74202': 'video',       // other specialist photography
  '96020': 'beauty',      // hairdressing and beauty treatment
}

/** Two-digit divisions. Everything not listed classifies as unknown. */
const DIVISION: Record<string, string> = {
  '01': 'agriculture', '02': 'agriculture', '03': 'agriculture',
  '05': 'energy', '06': 'energy', '07': 'energy', '08': 'energy', '09': 'energy',
  '10': 'food_products', '11': 'food_products', '12': 'food_products',
  '13': 'fashion', '14': 'fashion', '15': 'fashion',
  '16': 'manufacturing', '17': 'manufacturing', '18': 'publishing',
  '19': 'energy', '20': 'manufacturing', '21': 'healthcare', '22': 'manufacturing',
  '23': 'manufacturing', '24': 'manufacturing', '25': 'manufacturing',
  '26': 'manufacturing', '27': 'manufacturing', '28': 'manufacturing',
  '29': 'automotive', '30': 'automotive',
  '31': 'home_goods', '32': 'manufacturing', '33': 'manufacturing',
  '35': 'energy', '36': 'energy', '37': 'energy', '38': 'energy', '39': 'energy',
  '41': 'construction', '42': 'construction', '43': 'construction',
  '45': 'automotive', '46': 'retail', '47': 'retail',
  '49': 'logistics', '50': 'logistics', '51': 'travel', '52': 'logistics', '53': 'logistics',
  '55': 'travel', '56': 'restaurant',
  '58': 'publishing', '59': 'video', '60': 'video', '61': 'telecom',
  '62': 'dev_tools', '63': 'data',
  '64': 'banking', '65': 'insurance', '66': 'banking',
  '68': 'real_estate', '69': 'legal', '70': 'consulting', '71': 'construction',
  '72': 'data', '73': 'advertising', '74': 'consulting', '75': 'healthcare',
  '77': 'logistics', '78': 'consulting', '79': 'travel', '80': 'security',
  '81': 'consulting', '82': 'consulting', '84': 'consulting',
  '85': 'education',
  '86': 'healthcare', '87': 'healthcare', '88': 'healthcare',
  '90': 'entertainment', '91': 'entertainment', '92': 'gaming', '93': 'entertainment',
  '94': 'consulting', '95': 'manufacturing', '96': 'consulting',
}

/**
 * The division table by two-digit prefix, for any declared industry code built
 * on the same EU standard.
 *
 * UK SIC 2007 and French NAF (APE) 2008 are both derived from NACE Rev. 2, and
 * share the same two-digit division numbering — only the finer subdivisions and
 * the letter suffix France appends differ. Rather than maintaining a second,
 * independently-tuned division table for the French company register, this is
 * the same one: a NAF code like `62.01Z` and a SIC code like `62012` both mean
 * "computer programming" at the division level, and disagreeing about that
 * would be a bug, not a feature.
 */
export function industryForNaceDivision(rawCode: string): string | undefined {
  const digits = rawCode.replace(/[^0-9]/g, '')
  if (digits.length < 2) return undefined
  return DIVISION[digits.slice(0, 2)]
}

/**
 * Taxonomy node for a company's declared SIC codes.
 *
 * Companies routinely declare several. The first is conventionally the primary
 * activity, so it wins; the rest are returned as secondary hints. Dormant and
 * non-trading codes (98000, 99999) carry no industry meaning and are skipped
 * rather than being allowed to outvote a real code.
 */
export function industriesForSicCodes(codes: readonly string[]): string[] {
  const out: string[] = []
  for (const raw of codes) {
    const code = raw.trim()
    if (code === '' || code.startsWith('98') || code.startsWith('99')) continue
    const mapped = EXACT[code] ?? DIVISION[code.slice(0, 2)]
    if (mapped !== undefined && !out.includes(mapped)) out.push(mapped)
  }
  return out
}
