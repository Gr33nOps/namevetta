import type { ReactNode } from 'react'

export function PageHeader({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <header className="page-header flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="page-title">{title}</h1>
        {children ? <div className="page-lead">{children}</div> : null}
      </div>
      {action}
    </header>
  )
}
