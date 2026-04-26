export default function PropertiesLoading() {
  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-br from-slate-50 to-stone-100">
      {/* Header placeholder */}
      <div className="bg-gradient-to-r from-slate-800 to-stone-800 border-b border-amber-200/20 px-8 py-6 shadow-lg">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-8 w-32 bg-white/20 rounded-lg animate-pulse" />
            <div className="h-4 w-56 bg-white/10 rounded animate-pulse" />
          </div>
          <div className="h-10 w-28 bg-amber-600/40 rounded-lg animate-pulse" />
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-8 py-8">
        {/* Search placeholder */}
        <div className="mb-6 h-12 w-full bg-white border border-stone-200 rounded-xl animate-pulse" />

        {/* Card grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="bg-white rounded-xl overflow-hidden shadow-md border border-stone-200"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className="aspect-video bg-stone-200 animate-pulse" />
              <div className="p-5 space-y-2">
                <div className="h-5 w-3/4 bg-stone-200 rounded animate-pulse" />
                <div className="h-4 w-1/2 bg-stone-100 rounded animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
