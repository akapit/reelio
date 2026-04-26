"use client";

import { useState } from "react";
import {
  X as XIcon,
  Share2,
  Play,
  Video,
  Image as ImageIcon,
  MessageSquare,
  Globe,
} from "lucide-react";

interface SocialPlatform {
  id: string;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  color: string;
}

const socialPlatformsList: SocialPlatform[] = [
  {
    id: "instagram_post",
    label: "Instagram Post",
    Icon: ImageIcon,
    color: "text-pink-600",
  },
  {
    id: "instagram_story",
    label: "Instagram Story",
    Icon: Share2,
    color: "text-purple-600",
  },
  {
    id: "instagram_reels",
    label: "Instagram Reels",
    Icon: Video,
    color: "text-orange-600",
  },
  {
    id: "threads",
    label: "Threads",
    Icon: MessageSquare,
    color: "text-slate-800",
  },
  {
    id: "facebook_post",
    label: "Facebook Post",
    Icon: Globe,
    color: "text-blue-600",
  },
  {
    id: "facebook_reels",
    label: "Facebook Reels",
    Icon: Play,
    color: "text-blue-700",
  },
  {
    id: "tiktok",
    label: "TikTok",
    Icon: Video,
    color: "text-slate-900",
  },
  {
    id: "x",
    label: "X (Twitter)",
    Icon: Share2,
    color: "text-slate-700",
  },
  {
    id: "linkedin",
    label: "LinkedIn",
    Icon: Globe,
    color: "text-blue-700",
  },
  {
    id: "youtube_shorts",
    label: "YouTube Shorts",
    Icon: Play,
    color: "text-red-600",
  },
];

interface ShareModalProps {
  open: boolean;
  onClose: () => void;
  shareAsPost?: boolean;
}

export function ShareModal({ open, onClose, shareAsPost }: ShareModalProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  if (!open) return null;

  const allSelected = selected.size === socialPlatformsList.length;

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(socialPlatformsList.map((p) => p.id)));
    }
  };

  const togglePlatform = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSubmit = () => {
    console.log("TODO: publish to", Array.from(selected), { shareAsPost });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      dir="rtl"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 bg-white rounded-t-2xl border-b border-stone-200 px-6 py-5 flex items-center justify-between z-10">
          <h2 className="text-xl font-bold text-slate-900">שיתוף ברשתות חברתיות</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 transition-colors rounded-lg hover:bg-stone-100"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          {/* Select all / deselect all */}
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-slate-600">
              {selected.size} פלטפורמות נבחרו
            </p>
            <button
              type="button"
              onClick={toggleAll}
              className="text-sm font-medium text-amber-700 hover:text-amber-900 transition-colors"
            >
              {allSelected ? "בטל הכל" : "בחר הכל"}
            </button>
          </div>

          {/* Platform grid */}
          <div className="grid grid-cols-2 gap-3">
            {socialPlatformsList.map(({ id, label, Icon, color }) => {
              const isActive = selected.has(id);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => togglePlatform(id)}
                  className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all text-right ${
                    isActive
                      ? "border-amber-600 bg-amber-50"
                      : "border-stone-200 bg-white hover:border-amber-300 hover:bg-amber-50/50"
                  }`}
                >
                  <Icon className={`w-5 h-5 flex-shrink-0 ${color}`} />
                  <span className="text-sm font-medium text-slate-800 flex-1">
                    {label}
                  </span>
                  <div
                    className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                      isActive
                        ? "border-amber-600 bg-amber-600"
                        : "border-stone-300"
                    }`}
                  >
                    {isActive && (
                      <svg
                        viewBox="0 0 12 12"
                        className="w-3 h-3 text-white fill-current"
                      >
                        <path d="M10 3L5 8.5 2 5.5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Submit */}
          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={selected.size === 0}
              className="flex-1 px-5 py-3 bg-gradient-to-r from-amber-600 to-amber-700 text-white rounded-xl font-semibold hover:from-amber-700 hover:to-amber-800 transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              שתף ({selected.size})
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-3 bg-stone-100 text-slate-700 rounded-xl font-medium hover:bg-stone-200 transition-colors"
            >
              ביטול
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
