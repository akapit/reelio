export default function ProjectLoading() {
  return (
    <div className="max-w-7xl mx-auto space-y-8">
      {/* Back button skeleton */}
      <div className="h-8 w-28 rounded-lg animate-pulse bg-[var(--color-surface)] border border-[var(--color-border)]" />

      {/* Project header skeletons */}
      <div className="space-y-3">
        <div className="h-9 w-72 rounded-lg animate-pulse bg-[var(--color-surface)] border border-[var(--color-border)]" />
        <div className="flex flex-wrap items-center gap-4">
          <div className="h-4 w-48 rounded-md animate-pulse bg-[var(--color-surface)] border border-[var(--color-border)]" />
          <div className="h-4 w-36 rounded-md animate-pulse bg-[var(--color-surface)] border border-[var(--color-border)]" />
        </div>
      </div>

      {/* Divider skeleton */}
      <div className="h-px bg-[var(--color-border)]" />

      {/* Upload area skeleton */}
      <div className="space-y-3">
        <div className="h-6 w-32 rounded-md animate-pulse bg-[var(--color-surface)] border border-[var(--color-border)]" />
        <div className="h-48 rounded-xl animate-pulse bg-[var(--color-surface)] border border-[var(--color-border)]">
          {/* Inner dashed border hint */}
          <div className="h-full rounded-xl border border-dashed border-[var(--color-border)]/50 m-3 flex flex-col items-center justify-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[var(--color-surface-raised)]" />
            <div className="space-y-1.5 flex flex-col items-center">
              <div className="h-3.5 w-40 rounded-md bg-[var(--color-surface-raised)]" />
              <div className="h-3 w-28 rounded-md bg-[var(--color-surface-raised)]" />
            </div>
          </div>
        </div>
      </div>

      {/* Assets section */}
      <div className="space-y-4">
        <div className="h-6 w-20 rounded-md animate-pulse bg-[var(--color-surface)] border border-[var(--color-border)]" />

        {/* Asset card grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl overflow-hidden animate-pulse bg-[var(--color-surface)] border border-[var(--color-border)]"
              style={{ animationDelay: `${i * 75}ms` }}
            >
              {/* Image area */}
              <div className="aspect-[4/3] bg-[var(--color-surface-raised)]" />
              {/* Card footer */}
              <div className="p-3 space-y-2">
                <div className="h-3.5 w-4/5 rounded-md bg-[var(--color-surface-raised)]" />
                <div className="flex items-center justify-between gap-2">
                  <div className="h-5 w-16 rounded-full bg-[var(--color-surface-raised)]" />
                  <div className="h-3 w-12 rounded-md bg-[var(--color-surface-raised)]" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
