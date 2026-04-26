export default function PropertyDetailLoading() {
  return (
    <div
      className="min-h-screen bg-gradient-to-br from-slate-50 to-stone-100 flex flex-col"
      dir="rtl"
    >
      {/* Header skeleton */}
      <div className="bg-gradient-to-r from-slate-800 to-stone-800 border-b border-amber-200/20 px-4 md:px-8 py-4 shadow-lg">
        <div className="max-w-[1800px] mx-auto flex items-center justify-between">
          <div className="h-6 w-24 rounded bg-slate-700 animate-pulse" />
          <div className="h-7 w-20 rounded bg-slate-700 animate-pulse" />
          <div className="w-16 md:w-32" />
        </div>
      </div>

      <main className="flex-1 overflow-auto">
        <div className="max-w-[1800px] mx-auto px-4 md:px-8 py-4 md:py-8">
          {/* Desktop preview + gallery skeleton */}
          <div className="hidden md:grid grid-cols-2 gap-8 mb-8">
            <div className="bg-white rounded-xl shadow-lg border border-stone-200 p-6">
              <div className="aspect-video bg-stone-100 rounded-lg animate-pulse" />
            </div>
            <div className="bg-white rounded-xl shadow-lg border border-stone-200 p-6">
              <div className="grid grid-cols-4 gap-3">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div
                    key={i}
                    className="aspect-square bg-stone-100 rounded-lg animate-pulse"
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Tabs skeleton */}
          <div className="bg-white rounded-xl shadow-lg border border-stone-200 overflow-hidden">
            {/* Tab bar */}
            <div className="grid grid-cols-4 border-b border-stone-200">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="h-14 bg-stone-50 border-l border-stone-200 animate-pulse last:border-l-0"
                />
              ))}
            </div>
            {/* Tab content */}
            <div className="p-4 md:p-6 space-y-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="h-10 bg-stone-100 rounded-lg animate-pulse"
                  style={{ width: `${70 + (i % 3) * 10}%` }}
                />
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
