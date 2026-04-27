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
  Check,
} from "lucide-react";
import { useI18n } from "@/lib/i18n/client";

interface SocialPlatform {
  id: string;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  color: string;
}

const socialPlatformsList: SocialPlatform[] = [
  { id: "instagram_post",   label: "Instagram Post",   Icon: ImageIcon,     color: "text-pink-600" },
  { id: "instagram_story",  label: "Instagram Story",  Icon: Share2,        color: "text-purple-600" },
  { id: "instagram_reels",  label: "Instagram Reels",  Icon: Video,         color: "text-orange-600" },
  { id: "threads",          label: "Threads",          Icon: MessageSquare, color: "text-slate-800" },
  { id: "facebook_post",    label: "Facebook Post",    Icon: Globe,         color: "text-blue-600" },
  { id: "facebook_reels",   label: "Facebook Reels",   Icon: Play,          color: "text-blue-700" },
  { id: "tiktok",           label: "TikTok",           Icon: Video,         color: "text-slate-900" },
  { id: "x",                label: "X (Twitter)",      Icon: Share2,        color: "text-slate-700" },
  { id: "linkedin",         label: "LinkedIn",         Icon: Globe,         color: "text-blue-700" },
  { id: "youtube_shorts",   label: "YouTube Shorts",   Icon: Play,          color: "text-red-600" },
];

interface ShareModalProps {
  open: boolean;
  onClose: () => void;
  shareAsPost?: boolean;
}

export function ShareModal({ open, onClose, shareAsPost }: ShareModalProps) {
  const { t } = useI18n();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  if (!open) return null;

  const allSelected = selected.size === socialPlatformsList.length;

  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(socialPlatformsList.map((p) => p.id)));
  };

  const togglePlatform = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSubmit = () => {
    console.log("TODO: publish to", Array.from(selected), { shareAsPost });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--line-soft)] px-6 py-5">
          <h2 className="text-xl font-bold text-[var(--fg-0)]">
            {t.modals.socialShare}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--fg-3)] transition-colors hover:bg-[var(--bg-2)] hover:text-[var(--fg-0)]"
            aria-label={t.common.cancel}
          >
            <XIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-1 flex-col overflow-hidden px-5 pt-4 pb-5">
          {/* Sub-header: prompt + select-all link */}
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-medium text-[var(--fg-0)]">
              {t.modals.choosePlatforms}
            </p>
            <button
              type="button"
              onClick={toggleAll}
              className="text-sm font-semibold text-[var(--gold)] transition-colors hover:text-[var(--gold-hi)]"
            >
              {allSelected ? t.modals.deselectAll : t.common.selectAll}
            </button>
          </div>

          {/* Vertical list of platforms */}
          <div className="flex-1 overflow-y-auto rounded-xl bg-[var(--bg-2)]/40 p-2">
            <ul className="flex flex-col gap-2">
              {socialPlatformsList.map(({ id, label, Icon, color }) => {
                const isActive = selected.has(id);
                return (
                  <li key={id}>
                    <button
                      type="button"
                      onClick={() => togglePlatform(id)}
                      className={[
                        "flex w-full items-center gap-3 rounded-xl border bg-white px-4 py-3 text-start transition-all",
                        isActive
                          ? "border-[var(--gold)] bg-[var(--gold-tint)]/40 ring-1 ring-[var(--gold-tint-2)]"
                          : "border-[var(--line-soft)] hover:border-[var(--gold)]/50 hover:bg-[var(--gold-tint)]/20",
                      ].join(" ")}
                    >
                      <Icon className={`h-5 w-5 shrink-0 ${color}`} />
                      <span className="flex-1 truncate text-sm font-medium text-[var(--fg-0)]">
                        {label}
                      </span>
                      <span
                        className={[
                          "flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors",
                          isActive
                            ? "border-[var(--gold)] bg-[var(--gold)] text-[var(--on-gold)]"
                            : "border-[var(--line-soft)] bg-white",
                        ].join(" ")}
                        aria-hidden="true"
                      >
                        {isActive && <Check className="h-3 w-3" strokeWidth={3} />}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Submit row */}
          <div className="mt-4 flex gap-3">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={selected.size === 0}
              className="flex-1 rounded-xl bg-gradient-to-r from-[var(--gold)] to-[var(--gold-hi)] px-5 py-3 font-semibold text-[var(--on-gold)] shadow-md transition-all hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t.modals.share} ({selected.size})
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl bg-[var(--bg-2)] px-5 py-3 font-medium text-[var(--fg-2)] transition-colors hover:bg-[var(--bg-3)]"
            >
              {t.common.cancel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
