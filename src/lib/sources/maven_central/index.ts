/**
 * Maven Central check (Java, Kotlin, Scala).
 *
 * A Maven artifact is `groupId:artifactId`, so there is no single URL for a
 * bare name. The Solr search endpoint answers with a count instead, which is
 * why this decides from the body rather than the status: a name nobody uses
 * still returns 200, with `numFound: 0`.
 */
import { exactProbeAdapter } from '@/lib/sources/exact-probe'

export const mavenCentralAdapter = exactProbeAdapter({
  id: 'maven_central',
  label: 'Maven Central',
  probe: (n) => `https://search.maven.org/solrsearch/select?q=a:${encodeURIComponent(n)}&rows=1&wt=json`,
  page: (n) => `https://central.sonatype.com/search?q=${encodeURIComponent(n)}`,
  kind: 'java artifact',
  claimedFromBody: (body) => {
    try {
      const found = (JSON.parse(body) as { response?: { numFound?: number } }).response?.numFound
      return typeof found === 'number' ? found > 0 : undefined
    } catch {
      // Malformed JSON is an absence of information, not a free name.
      return undefined
    }
  },
})
