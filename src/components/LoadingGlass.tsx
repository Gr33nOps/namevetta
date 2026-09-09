/** Decorative motion only. Actual progress is announced by the calling view. */
export function LoadingGlass() {
  return (
    <div className="loading-glass" aria-hidden="true">
      <span className="loading-halo" />
      <span className="loading-orbit" />
      {[0, 1, 2].map((index) => (
        <span className="loading-tile" key={index}>
          <span className="loading-tile-mark" />
          <span className="loading-line" />
          <span className="loading-line loading-line-short" />
        </span>
      ))}
    </div>
  )
}
