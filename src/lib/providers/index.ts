import 'server-only'

/**
 * Provider selection.
 *
 * One place decides which search provider is active, so replacing it is a
 * one-line change here rather than an edit across every adapter (§23).
 */
import { tavilyProvider } from './tavily'
import type { WebSearchProvider } from './web-search'

/** Registered providers, in preference order. */
const PROVIDERS: WebSearchProvider[] = [tavilyProvider]

/** The active web search provider, or undefined when none is configured. */
export function webSearchProvider(): WebSearchProvider | undefined {
  return PROVIDERS[0]
}

export * from './web-search'
export { tavilyProvider, TAVILY_PROVIDER_ID } from './tavily'
