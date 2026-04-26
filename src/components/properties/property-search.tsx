"use client";

import { Search } from "lucide-react";

interface PropertySearchProps {
  value: string;
  onChange: (v: string) => void;
}

export function PropertySearch({ value, onChange }: PropertySearchProps) {
  return (
    <div className="relative">
      <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="חפש לפי כתובת, שם בעלים או טלפון..."
        className="w-full pr-12 pl-4 py-3 bg-white border border-stone-300 rounded-xl focus:border-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-200 text-right"
      />
    </div>
  );
}
