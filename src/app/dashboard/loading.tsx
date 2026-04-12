export default function DashboardLoading() {
  return (
    <div className="max-w-7xl mx-auto space-y-10">
      {/* Heading skeleton */}
      <div className="space-y-2">
        <div className="h-9 w-56 rounded-lg animate-pulse bg-[var(--color-surface)] border border-[var(--color-border)]" />
        <div className="h-4 w-80 rounded-md animate-pulse bg-[var(--color-surface)] border border-[var(--color-border)]" />
      </div>

      {/* Stat card skeletons */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 p-5 rounded-xl animate-pulse bg-[var(--color-surface)] border border-[var(--color-border)]"
          >
            {/* Icon placeholder */}
            <div className="w-10 h-10 rounded-lg shrink-0 bg-[var(--color-surface-raised)]" />
            {/* Text placeholders */}
            <div className="flex flex-col gap-2 flex-1 min-w-0">
              <div className="h-3 w-24 rounded-md bg-[var(--color-surface-raised)]" />
              <div className="h-7 w-16 rounded-md bg-[var(--color-surface-raised)]" />
            </div>
          </div>
        ))}
      </div>

      {/* Section heading skeleton */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="h-7 w-40 rounded-lg animate-pulse bg-[var(--color-surface)] border border-[var(--color-border)]" />
          <div className="h-8 w-28 rounded-lg animate-pulse bg-[var(--color-surface)] border border-[var(--color-border)]" />
        </div>

        {/* Project card skeletons */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="flex flex-col gap-4 p-5 rounded-xl animate-pulse bg-[var(--color-surface)] border border-[var(--color-border)]"
              style={{ animationDelay: `${i * 75}ms` }}
            >
              {/* Name + badge row */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 space-y-1.5">
                  <div className="h-5 w-full rounded-md bg-[var(--color-surface-raised)]" />
                  <div className="h-5 w-3/5 rounded-md bg-[var(--color-surface-raised)]" />
                </div>
                <div className="h-5 w-10 rounded-full bg-[var(--color-surface-raised)] shrink-0" />
              </div>
              {/* Meta rows */}
              <div className="flex flex-col gap-2 mt-auto">
                <div className="h-3 w-4/5 rounded-md bg-[var(--color-surface-raised)]" />
                <div className="h-3 w-2/5 rounded-md bg-[var(--color-surface-raised)]" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
