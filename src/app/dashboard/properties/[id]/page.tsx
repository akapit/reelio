"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PropertyDetail } from "@/components/properties/property-detail";

interface Property {
  id: string;
  name: string;
  metadata?: Record<string, unknown> | null;
  created_at: string;
  property_address?: string | null;
}

export default function PropertyDetailPage() {
  const params = useParams();
  const id = params?.id as string;

  const [property, setProperty] = useState<Property | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const hasFetched = useRef(false);

  useEffect(() => {
    if (!id || hasFetched.current) return;
    hasFetched.current = true;

    const supabase = createClient();

    async function fetchProperty() {
      setIsLoading(true);
      setIsError(false);
      try {
        const { data, error } = await supabase
          .from("projects")
          .select("id, name, created_at, property_address")
          .eq("id", id)
          .single();
        if (error) throw error;
        setProperty(data as Property);
      } catch (err) {
        console.error("[property-detail] fetch failed", err);
        setIsError(true);
      } finally {
        setIsLoading(false);
      }
    }

    fetchProperty();
  }, [id]);

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="hidden md:grid md:grid-cols-5 gap-6 lg:gap-8">
          <div className="md:col-span-2 bg-white rounded-xl shadow-lg border border-stone-200 p-5 lg:p-6">
            <div className="grid grid-cols-3 lg:grid-cols-4 gap-2 lg:gap-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="aspect-square bg-stone-100 rounded-lg animate-pulse" />
              ))}
            </div>
          </div>
          <div className="md:col-span-3 bg-white rounded-xl shadow-lg border border-stone-200 p-5 lg:p-6">
            <div className="aspect-video bg-stone-100 rounded-lg animate-pulse" />
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-lg border border-stone-200 overflow-hidden">
          <div className="grid grid-cols-4 border-b border-stone-200">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-14 bg-stone-50 border-l border-stone-200 animate-pulse last:border-l-0" />
            ))}
          </div>
          <div className="p-4 md:p-6 space-y-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-10 bg-stone-100 rounded-lg animate-pulse" style={{ width: `${70 + (i % 3) * 10}%` }} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (isError || !property) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center bg-white rounded-xl border border-red-200 p-8 shadow-md max-w-md mx-4">
          <p className="text-sm font-medium text-red-500 mb-1">הנכס לא נמצא</p>
          <p className="text-xs text-slate-500">
            ייתכן שהנכס נמחק או שאין לך הרשאת גישה.
          </p>
        </div>
      </div>
    );
  }

  return <PropertyDetail projectId={property.id} property={property} />;
}
