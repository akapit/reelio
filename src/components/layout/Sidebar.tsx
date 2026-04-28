"use client";

import { useEffect, useCallback, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import {
  Home as HomeIcon,
  LayoutGrid,
  LayoutTemplate,
  X,
  User,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { reelioDesignSystem } from "@/lib/design-system.config";
import { useProperties } from "@/hooks/use-properties";
import { useI18n } from "@/lib/i18n/client";
import { createClient } from "@/lib/supabase/client";

const EASE_OUT = [0.22, 1, 0.36, 1] as const;
const PROFILE_UPDATED_EVENT = "reelio:profile-updated";

const navItems = [
  { labelKey: "home", href: "/dashboard", icon: HomeIcon, exact: true, disabled: false },
  {
    labelKey: "properties",
    href: "/dashboard/properties",
    icon: LayoutGrid,
    exact: false,
    disabled: false,
  },
  {
    labelKey: "templates",
    href: "/dashboard/templates",
    icon: LayoutTemplate,
    exact: false,
    disabled: true,
  },
] as const;

const TONES = ["warm", "cool", "amber", "sunset", "mono"] as const;
function pickTone(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return TONES[Math.abs(h) % TONES.length];
}

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  desktopCollapsed?: boolean;
  onToggleCollapse?: () => void;
  onNewProject?: () => void;
}

export function Sidebar({
  isOpen,
  onClose,
  desktopCollapsed = false,
  onToggleCollapse,
  onNewProject,
}: SidebarProps) {
  const pathname = usePathname();
  const { data: rows } = useProperties();
  const { t, dir } = useI18n();
  const recent = (rows ?? []).slice(0, 3) as Array<{
    id: string;
    name: string;
    property_address?: string;
  }>;

  const [profile, setProfile] = useState<{
    full_name: string | null;
    avatar_url: string | null;
    email: string | null;
    plan: string | null;
  } | null>(null);

  const loadProfile = useCallback(
    async (cancelled?: () => boolean) => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled?.()) return;
      const { data } = await supabase
        .from("profiles")
        .select("full_name, avatar_url, plan")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled?.()) return;
      const metadata = user.user_metadata as {
        full_name?: string;
        name?: string;
        avatar_url?: string;
        picture?: string;
      };
      setProfile({
        full_name:
          (data?.full_name as string | null) ??
          metadata.full_name ??
          metadata.name ??
          null,
        avatar_url:
          (data?.avatar_url as string | null) ??
          metadata.avatar_url ??
          metadata.picture ??
          null,
        email: user.email ?? null,
        plan: (data?.plan as string | null) ?? null,
      });
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    loadProfile(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [loadProfile]);

  useEffect(() => {
    const handleProfileUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{
        profile?: {
          full_name?: string | null;
          avatar_url?: string | null;
          email?: string | null;
          plan?: string | null;
        };
      }>).detail;

      if (detail?.profile) {
        setProfile((prev) => ({
          full_name: detail.profile?.full_name ?? null,
          avatar_url: detail.profile?.avatar_url ?? null,
          email: detail.profile?.email ?? prev?.email ?? null,
          plan: detail.profile?.plan ?? null,
        }));
        return;
      }

      loadProfile();
    };

    window.addEventListener(PROFILE_UPDATED_EVENT, handleProfileUpdated);
    return () => {
      window.removeEventListener(PROFILE_UPDATED_EVENT, handleProfileUpdated);
    };
  }, [loadProfile]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }
  }, [isOpen, handleKeyDown]);

  function isActive(href: string, exact: boolean) {
    if (exact) return pathname === href;
    return pathname.startsWith(href);
  }

  // Sidebar uses dark warm-charcoal even in light theme — mirrors the design.
  // Locally redefine token vars so child elements using var(--bg-2)/var(--fg-2)
  // resolve to dark equivalents inside the sidebar.
  const sidebarStyle: React.CSSProperties = {
    background: "var(--sidebar-bg)",
    borderRight: "1px solid rgb(255 255 255 / 0.10)",
    color: "#f8f7f3",
    ["--bg-1" as string]: "#272830",
    ["--bg-2" as string]: "#30313a",
    ["--bg-3" as string]: "#3a3b45",
    ["--fg-0" as string]: "#ffffff",
    ["--fg-1" as string]: "#f8f7f3",
    ["--fg-2" as string]: "#d6d1c8",
    ["--fg-3" as string]: "#a8a399",
    ["--line" as string]: "rgb(255 255 255 / 0.22)",
    ["--line-soft" as string]: "rgb(255 255 255 / 0.12)",
    ["--rail-bg" as string]: "#34353e",
  };
  const profileName =
    profile?.full_name?.trim() || profile?.email?.trim() || t.shell.profile;
  const profileAvatarUrl = profile?.avatar_url?.trim() || null;
  const CollapseIcon = desktopCollapsed
    ? dir === "rtl"
      ? ChevronLeft
      : ChevronRight
    : dir === "rtl"
      ? ChevronRight
      : ChevronLeft;

  // `collapsed` only applies to the desktop rail (the mobile drawer always
  // shows full content since it's a slide-over). We render the same component
  // tree in both states and just hide labels / footer text in collapsed mode
  // so the width transition is purely a CSS animation on a single element.
  const buildSidebarContent = (collapsed: boolean) => (
    <>
      {/* Wordmark + collapse toggle */}
      <div
        className={cn(
          "flex items-center shrink-0",
          collapsed ? "flex-col gap-2 px-3 pt-4 pb-3" : "justify-between px-4 pt-5 pb-3",
        )}
      >
        {!collapsed && (
          <Image
            src={reelioDesignSystem.assets.logo.forDark}
            alt="Reelio"
            width={176}
            height={50}
            priority
            style={{
              width: 176,
              height: "auto",
              display: "block",
            }}
          />
        )}
        {collapsed && (
          <Image
            src={reelioDesignSystem.assets.mark.gold}
            alt="Reelio"
            width={36}
            height={46}
            priority
            style={{
              width: 36,
              height: "auto",
              display: "block",
              filter: "drop-shadow(0 8px 18px rgb(223 111 0 / 0.24))",
            }}
          />
        )}
        <button
          type="button"
          onClick={onClose}
          className="lg:hidden flex items-center justify-center w-8 h-8 rounded-md text-white/70 hover:text-white hover:bg-white/10 transition-colors duration-150"
          aria-label={t.common.close}
        >
          <X size={16} />
        </button>
        {/* Desktop collapse toggle — only render when handler is supplied */}
        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            className="hidden lg:flex items-center justify-center w-7 h-7 rounded-md text-white/60 hover:text-white hover:bg-white/10 transition-colors duration-150"
            aria-label={collapsed ? t.shell.expandSidebar : t.shell.collapseSidebar}
            title={collapsed ? t.shell.expandSidebar : t.shell.collapseSidebar}
          >
            <CollapseIcon size={14} />
          </button>
        )}
      </div>

      {/* New reel CTA — orange gradient */}
      <div className={cn(collapsed ? "px-2 pb-3" : "px-4 pb-4")}>
        <button
          type="button"
          onClick={onNewProject}
          className={cn(
            "btn-generate w-full",
            "justify-center",
          )}
          style={{ height: 36 }}
          title={collapsed ? t.shell.newReel : undefined}
          aria-label={t.shell.newReel}
        >
          {collapsed ? (
            <span className="text-[11px] font-medium">
              {t.common.new}
            </span>
          ) : (
            <span>{t.shell.newReel}</span>
          )}
        </button>
      </div>

      {/* Navigation + Recent — single scroll container */}
      <nav
        className={cn(
          "flex-1 overflow-y-auto scroll",
          collapsed ? "px-2" : "px-4",
        )}
        aria-label={t.shell.primary}
      >
        <ul className="space-y-0.5">
          {navItems.map(({ labelKey, href, icon: Icon, exact, disabled }) => {
            const label = t.shell.routes[labelKey];
            const active = !disabled && isActive(href, exact);
            const title = disabled
              ? `${label} - ${t.shell.comingSoon}`
              : collapsed
                ? label
                : undefined;
            const content = (
              <>
                {active && !collapsed && (
                  <span
                    style={{
                      position: "absolute",
                      insetInlineStart: -16,
                      top: 8,
                      bottom: 8,
                      width: 2,
                      background: "var(--gold)",
                      borderRadius: 2,
                    }}
                  />
                )}
                <Icon
                  size={15}
                  style={{
                    color: disabled
                      ? "var(--fg-3)"
                      : active
                        ? "var(--fg-0)"
                        : "var(--fg-2)",
                  }}
                />
                {!collapsed && (
                  <>
                    <span className="min-w-0 truncate">{label}</span>
                    {disabled && (
                      <span
                        className="mono shrink-0 rounded-full border px-2 py-0.5 text-[9px] uppercase"
                        style={{
                          borderColor: "rgb(223 111 0 / 0.35)",
                          color: "var(--gold-hi)",
                          background: "rgb(223 111 0 / 0.14)",
                          letterSpacing: "0.08em",
                        }}
                      >
                        {t.shell.comingSoon}
                      </span>
                    )}
                  </>
                )}
              </>
            );
            return (
              <li key={href}>
                {disabled ? (
                  <button
                    type="button"
                    disabled
                    aria-disabled="true"
                    aria-label={collapsed ? title : undefined}
                    title={title}
                    className={cn(
                      "group relative flex w-full items-center rounded-md text-[13px] transition-colors duration-150",
                      collapsed
                        ? "justify-center h-9"
                        : "gap-2.5 px-2.5 py-2",
                    )}
                    style={{
                      color: "var(--fg-3)",
                      background: "transparent",
                      cursor: "not-allowed",
                      opacity: 0.75,
                    }}
                  >
                    {content}
                  </button>
                ) : (
                <Link
                  href={href}
                  onClick={onClose}
                  aria-current={active ? "page" : undefined}
                  aria-label={collapsed ? label : undefined}
                  title={title}
                  className={cn(
                    "group relative flex items-center rounded-md text-[13px] transition-colors duration-150",
                    collapsed
                      ? "justify-center h-9"
                      : "gap-2.5 px-2.5 py-2",
                  )}
                  style={{
                    color: active
                      ? "var(--fg-0)"
                      : "var(--fg-2)",
                    background: active ? "var(--bg-2)" : "transparent",
                  }}
                  onMouseEnter={(e) => {
                    if (!active)
                      e.currentTarget.style.background =
                        "var(--bg-1)";
                  }}
                  onMouseLeave={(e) => {
                    if (!active)
                      e.currentTarget.style.background = "transparent";
                  }}
                >
                  {content}
                </Link>
                )}
              </li>
            );
          })}
        </ul>

        {!collapsed && recent.length > 0 && (
          <>
            <div
              aria-hidden="true"
              style={{
                height: 1,
                margin: "18px 8px 10px",
                background: "var(--line-soft)",
              }}
            />
            <ul className="space-y-0.5">
              {recent.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/dashboard/properties/${p.id}`}
                    onClick={onClose}
                    className="flex items-center gap-2.5 px-2 py-1.5 rounded-md transition-colors duration-150"
                    style={{
                      color: "var(--fg-2)",
                      fontSize: 12.5,
                      background: "transparent",
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.background =
                        "var(--bg-1)")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.background = "transparent")
                    }
                  >
                    <span
                      className="prop-img"
                      data-tone={pickTone(p.id)}
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 4,
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {p.property_address ?? p.name}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </nav>

      {/* Credits widget — hidden in collapsed mode */}
      {!collapsed && (
        <div className="px-4 pb-6">
          <div
            style={{
              padding: 12,
              borderRadius: 10,
              background: "rgb(223 111 0 / 0.08)",
              border: "1px solid rgb(223 111 0 / 0.20)",
            }}
          >
            <div
              className="kicker"
              style={{ marginBottom: 6, color: "var(--gold-hi)" }}
            >
              {t.shell.credits}
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
              }}
            >
              <span
                className="serif"
                style={{ fontSize: 22, letterSpacing: "-0.02em" }}
              >
                47
              </span>
              <span
                className="mono"
                style={{
                  fontSize: 11.5,
                  color: "var(--fg-3)",
                  letterSpacing: "0.04em",
                }}
              >
                {t.shell.of} 100
              </span>
            </div>
            <div
              style={{
                height: 3,
                background: "var(--rail-bg)",
                borderRadius: 2,
                overflow: "hidden",
                marginTop: 8,
              }}
            >
              <div
                style={{
                  width: "47%",
                  height: "100%",
                  background:
                    "linear-gradient(90deg, var(--gold-lo), var(--gold-hi))",
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* User pill — links to /dashboard/profile */}
      <div className={cn("shrink-0", collapsed ? "px-2 pb-3" : "px-3 pb-3")}>
        <Link
          href="/dashboard/profile"
          onClick={onClose}
          aria-label={profileName}
          title={collapsed ? profileName : undefined}
          className={cn(
            "flex items-center w-full rounded-lg transition-colors duration-150",
            collapsed ? "justify-center p-1.5" : "gap-2.5 p-1.5",
          )}
          style={{ background: "transparent" }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.background = "var(--bg-1)")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.background = "transparent")
          }
        >
          <div
            style={{
              width: collapsed ? 30 : 34,
              height: collapsed ? 30 : 34,
              borderRadius: 999,
              background: profileAvatarUrl
                ? `center / cover no-repeat url("${profileAvatarUrl}")`
                : "linear-gradient(180deg, var(--gold-hi), var(--gold-lo))",
              border: profileAvatarUrl ? "1px solid var(--line-soft)" : "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "var(--font-display)",
              fontSize: collapsed ? 14 : 16,
              color: "var(--on-gold)",
              flexShrink: 0,
            }}
          >
            {!profileAvatarUrl && <User size={collapsed ? 13 : 15} />}
          </div>
          {!collapsed && (
            <div
              style={{
                flex: 1,
                minWidth: 0,
                textAlign: "start",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  fontSize: 12.5,
                  color: "var(--fg-0)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {profileName}
              </div>
              <div
                className="mono"
                style={{
                  fontSize: 11,
                  color: "var(--fg-3)",
                  letterSpacing: "0.04em",
                }}
              >
                {profile?.plan ? `${profile.plan.toUpperCase()} PLAN` : ""}
              </div>
            </div>
          )}
        </Link>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop sidebar — width animates between 240 (open) and 64 (collapsed) */}
      <aside
        className={cn(
          "hidden lg:flex fixed top-0 z-40 h-screen flex-col shadow-xl overflow-hidden",
          "transition-[width] duration-100 ease-out",
        )}
        style={{
          ...sidebarStyle,
          insetInlineStart: 0,
          width: desktopCollapsed ? 64 : 240,
          contain: "layout paint style",
          willChange: "width",
        }}
        data-shell-sidebar=""
      >
        {buildSidebarContent(desktopCollapsed)}
      </aside>

      {/* Mobile drawer — slides in from the start edge, always full-width */}
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              key="sidebar-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: EASE_OUT }}
              className="fixed inset-0 bg-black/50 z-50 lg:hidden"
              onClick={onClose}
              aria-hidden="true"
            />

            <motion.aside
              key="sidebar-drawer"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ duration: 0.25, ease: EASE_OUT }}
              className="fixed top-0 z-50 lg:hidden h-screen w-[240px] flex flex-col shadow-xl"
              style={{ ...sidebarStyle, insetInlineStart: 0 }}
              role="dialog"
              aria-modal="true"
              aria-label={t.shell.navigation}
              data-shell-sidebar=""
            >
              {buildSidebarContent(false)}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
