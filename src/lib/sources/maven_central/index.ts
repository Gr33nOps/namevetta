/**
 * Maven Central check (Java, Kotlin, Scala).
 *
 * A Maven artifact is `groupId:artifactId`, so there is no single URL for a
 * bare name. The Solr search endpoint answers with a count instead, which is
 * why this decides from the body rather than the status: a name nobody uses
 * still returns 200, with `numFound: 0`.
 *
 * **Host changed from `search.maven.org` to `central.sonatype.com`.** The
 * former was failing roughly six lookups in ten in production, and sampling it
 * from outside showed why: two requests in six simply never answered inside
 * ten seconds. The Sonatype host serves the same Solr endpoint and answered
 * every request in the same sample, so the endpoint stays and the hostname
 * moves. `search.maven.org` remains a documented public interface; it is
 * simply not a reliable one right now.
 *
 * The manifest timeout is raised alongside this: the old 8s had to cover an
 * initial attempt, a backoff and a retry against a host whose slow path is
 * measured in seconds, so the retry rarely got to happen.
 */
import { exactProbeAdapter } from '@/lib/sources/exact-probe'

export const mavenCentralAdapter = exactProbeAdapter({
  id: 'maven_central',
  label: 'Maven Central',
  probe: (n) =>
    `https://central.sonatype.com/solrsearch/select?q=a:${encodeURIComponent(n)}&rows=1&wt=json`,
  page: (n) => `https://central.sonatype.com/search?q=${encodeURIComponent(n)}`,
  kind: 'java artifact',
  decide: (status, body) => {
    // Only a 200 carries a count. Anything else is an absence of information —
    // the old adapter reached the same conclusion, but by a route that also
    // swallowed the difference between "no answer" and "malformed answer".
    if (status !== 200) return undefined
    try {
      const found = (JSON.parse(body) as { response?: { numFound?: number } }).response?.numFound
      return typeof found === 'number' ? found > 0 : undefined
    } catch {
      // Malformed JSON is an absence of information, not a free name.
      return undefined
    }
  },
})
