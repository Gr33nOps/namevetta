import { NameSearch } from '@/components/NameSearch'

/**
 * The homepage.
 *
 * Centred in the viewport rather than sitting at the top with a large empty
 * band beneath it, which left the footer floating mid-page and made the screen
 * read as unfinished. `flex-1` on the wrapper claims the space `main` already
 * has, so the search box lands where the eye goes first.
 */
export default function Page() {
  return (
    <div className="flex min-h-[calc(100vh-8.5rem)] flex-col items-center justify-center px-5 py-16">
      <h1 className="mb-8 text-center font-display text-[34px] font-extrabold leading-tight tracking-tight text-charcoal sm:text-[44px]">
        Is your name taken?
      </h1>

      <NameSearch autoFocus />

      <p className="mt-5 text-center text-[13.5px] text-faint">
        Domains, GitHub, npm, social handles, app stores and more.
      </p>
    </div>
  )
}
