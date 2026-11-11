/** Shown while a page's data loads: shapes of what's coming, gently shimmering. */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading" className="space-y-6">
      <div className="pp-skeleton h-10 w-64" />
      <div className="pp-skeleton h-4 w-96 max-w-full" />
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <div className="pp-skeleton h-56 rounded-2xl" />
        <div className="pp-skeleton h-56 rounded-2xl" />
        <div className="pp-skeleton h-56 rounded-2xl" />
      </div>
    </div>
  );
}
