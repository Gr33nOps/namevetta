import { LoadingGlass } from './LoadingGlass'

export function ResearchProgress({ title, detail, status, children }: {
  title: string; detail: string; status: string; children?: React.ReactNode
}) {
  return <section className="panel loading-panel mx-auto w-full max-w-3xl rounded-panel p-6 text-center sm:p-10" aria-label="Research in progress">
    <LoadingGlass />
    <h2 className="font-display mt-3 text-2xl font-semibold text-charcoal">{title}</h2>
    <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-charcoal-2">{detail}</p>
    <p role="status" className="mt-5 min-h-5 text-sm tabular-nums text-charcoal-2">{status}</p>
    {children}
  </section>
}
