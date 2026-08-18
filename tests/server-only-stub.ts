/**
 * Test stub for the `server-only` package.
 *
 * The real module throws when imported from a client component, which is the
 * build-time guard that keeps the service-role key out of the browser (§36).
 * Unit tests import these modules directly, so the guard has to be stubbed —
 * it stays fully active in `next build`, which is where it matters.
 */
export {}
