export default function DashboardLoading() {
  return (
    <div
      className="mx-auto flex flex-col"
      style={{ maxWidth: 1280, gap: 22 }}
    >
      {/* Hero skeleton */}
      <section
        className="flex items-end justify-between gap-4"
        style={{ padding: "8px 0" }}
      >
        <div className="space-y-2.5">
          <div
            className="h-3 w-32 rounded animate-pulse"
            style={{ background: "var(--bg-2)" }}
          />
          <div
            className="h-9 w-72 rounded animate-pulse"
            style={{ background: "var(--bg-2)" }}
          />
        </div>
        <div className="flex gap-2">
          <div
            className="h-9 w-24 rounded-md animate-pulse"
            style={{ background: "var(--bg-2)" }}
          />
          <div
            className="h-9 w-32 rounded-md animate-pulse"
            style={{ background: "var(--bg-2)" }}
          />
        </div>
      </section>

      {/* Section heading skeleton */}
      <div className="flex items-baseline justify-between mb-3">
        <div
          className="h-7 w-40 rounded animate-pulse"
          style={{ background: "var(--bg-2)" }}
        />
        <div
          className="h-4 w-24 rounded animate-pulse"
          style={{ background: "var(--bg-2)" }}
        />
      </div>

      {/* Card grid skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="card overflow-hidden"
            style={{ padding: 0, animationDelay: `${i * 75}ms` }}
          >
            <div
              style={{ aspectRatio: "5 / 4", background: "var(--bg-2)" }}
              className="animate-pulse"
            />
            <div className="p-4 space-y-2">
              <div
                className="h-5 w-3/4 rounded animate-pulse"
                style={{ background: "var(--bg-2)" }}
              />
              <div
                className="h-4 w-1/2 rounded animate-pulse"
                style={{ background: "var(--bg-2)" }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
