import 'server-only'

/**
 * Supabase clients.
 *
 * `server-only` is imported at the top on purpose: it makes a client-component
 * import of this module a **build error**, which is a far better guard than a
 * code-review convention. §36 requires the service-role key never to reach the
 * browser, and this is what enforces it.
 *
 * Two clients, deliberately distinct:
 *
 *  * `serviceClient()` bypasses RLS entirely. Used only where the server is the
 *    one enforcing access — guest scans, orchestration writes, quota functions.
 *  * `anonClient()` respects RLS. Used for anything acting on behalf of a
 *    signed-in user, so the database is the final authority on what they see.
 *
 * Reaching for the service client "because it's simpler" is how RLS quietly
 * stops mattering, so each call site should be able to justify which it uses.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

const DbEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  /**
   * Salt for hashing guest IPs. Without it we would either store raw addresses
   * or use an unsalted hash, which is trivially reversible for IPv4 — the whole
   * space is only four billion values.
   */
  GUEST_HASH_SALT: z.string().min(16),
})

export type DbEnv = z.infer<typeof DbEnvSchema>

let cached: DbEnv | undefined

/** Parse database configuration, or explain precisely what is missing. */
export function dbEnv(): DbEnv {
  if (cached !== undefined) return cached
  const parsed = DbEnvSchema.safeParse(process.env)
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => i.path.join('.')).join(', ')
    throw new Error(
      `Supabase is not configured — missing or invalid: ${missing}. ` +
        'See .env.example. The app runs without a database, but persistence features will not.',
    )
  }
  cached = parsed.data
  return cached
}

/** True when persistence is fully configured. Callers degrade rather than crash. */
export function isDatabaseConfigured(): boolean {
  return DbEnvSchema.safeParse(process.env).success
}

export function resetDbEnvCache(): void {
  cached = undefined
}

let service: SupabaseClient | undefined

/**
 * Full-access client. **Bypasses RLS** — the caller is responsible for scoping.
 */
export function serviceClient(): SupabaseClient {
  if (service === undefined) {
    const env = dbEnv()
    service = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }
  return service
}

/**
 * RLS-respecting client, optionally carrying a user's access token so
 * `auth.uid()` resolves inside policies.
 */
export function anonClient(accessToken?: string): SupabaseClient {
  const env = dbEnv()
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    ...(accessToken === undefined
      ? {}
      : { global: { headers: { Authorization: `Bearer ${accessToken}` } } }),
  })
}
