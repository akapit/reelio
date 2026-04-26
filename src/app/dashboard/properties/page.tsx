"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { Building2, Plus } from "lucide-react";
import { useProperties } from "@/hooks/use-properties";
import { PropertyCard } from "@/components/properties/property-card";
import { PropertySearch } from "@/components/properties/property-search";
import { CreatePropertyModal } from "@/components/properties/CreatePropertyModal";
import { Button } from "@/components/ui/button";

export default function PropertiesPage() {
  const { data: rows, isLoading, isError } = useProperties();
  const [searchQuery, setSearchQuery] = useState("");
  const [modalOpen, setModalOpen] = useState(false);

  const properties = (rows ?? []).map((row) => ({
    id: row.id,
    address:
      (row as { property_address?: string; name: string })
        .property_address ?? row.name,
    photoCount: Array.isArray(row.assets)
      ? (row.assets[0]?.count ?? 0)
      : 0,
    videoCount: 0,
    thumbnailUrl: undefined as string | undefined,
    rooms: undefined as string | undefined,
    size: undefined as string | undefined,
    price: undefined as string | undefined,
  }));

  const filtered = properties.filter((p) =>
    p.address.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <>
      <div className="max-w-7xl mx-auto" dir="rtl">
        {/* Page header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2
              className="text-2xl lg:text-3xl font-semibold text-slate-900"
              style={{ fontFamily: "var(--font-display)" }}
            >
              נכסים
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              נהל את המדיה של נכסי הנדל&quot;ן שלך.
            </p>
          </div>
          <Button variant="primary" size="md" onClick={() => setModalOpen(true)}>
            <Plus size={16} />
            נכס חדש
          </Button>
        </div>

        {/* Search */}
        <div className="mb-6">
          <PropertySearch value={searchQuery} onChange={setSearchQuery} />
        </div>

        {/* Error */}
        {isError && (
          <div className="flex items-center justify-center h-32 rounded-xl border border-red-500/20 bg-red-500/5">
            <p className="text-sm text-red-400">
              שגיאה בטעינת הנכסים. רענן את הדף.
            </p>
          </div>
        )}

        {/* Loading skeletons */}
        {isLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 lg:gap-6">
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
        )}

        {/* Empty state */}
        {!isLoading && !isError && filtered.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="flex flex-col items-center justify-center gap-4 h-64 rounded-xl border border-dashed border-stone-300 bg-white"
          >
            <div className="w-14 h-14 rounded-full flex items-center justify-center bg-stone-100">
              <Building2 size={22} className="text-stone-400" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-slate-700">
                {searchQuery ? "לא נמצאו נכסים התואמים לחיפוש" : "אין נכסים עדיין"}
              </p>
              {!searchQuery && (
                <p className="text-xs text-slate-500 mt-0.5">
                  צור את הנכס הראשון שלך כדי להתחיל.
                </p>
              )}
            </div>
            {!searchQuery && (
              <Button variant="primary" size="sm" onClick={() => setModalOpen(true)}>
                <Plus size={14} />
                צור נכס ראשון
              </Button>
            )}
          </motion.div>
        )}

        {/* Property grid */}
        {!isLoading && !isError && filtered.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 lg:gap-6">
            {filtered.map((property, index) => (
              <motion.div
                key={property.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.05 }}
              >
                <PropertyCard {...property} />
              </motion.div>
            ))}
          </div>
        )}
      </div>

      <CreatePropertyModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
      />
    </>
  );
}
