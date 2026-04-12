"use client";

import { usePathname } from "next/navigation";
import { Menu, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

const pageTitles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/dashboard/projects": "Projects",
  "/dashboard/upload": "Upload",
  "/dashboard/settings": "Settings",
};

function getPageTitle(pathname: string): string {
  if (pageTitles[pathname]) return pageTitles[pathname];
  if (pathname.startsWith("/dashboard/projects/")) return "Project Workspace";
  return "Dashboard";
}

interface HeaderProps {
  onNewProject: () => void;
  onMenuToggle?: () => void;
}

export function Header({ onNewProject, onMenuToggle }: HeaderProps) {
  const pathname = usePathname();
  const title = getPageTitle(pathname);

  return (
    <header className="h-16 shrink-0 flex items-center justify-between px-4 sm:px-6 lg:px-8 bg-[var(--color-surface)] border-b border-[var(--color-border)]">
      <div className="flex items-center gap-3">
        {/* Mobile hamburger menu */}
        <button
          type="button"
          onClick={onMenuToggle}
          className="lg:hidden flex items-center justify-center w-10 h-10 -ml-2 rounded-lg text-[var(--color-muted)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-surface-raised)] transition-colors duration-150"
          aria-label="Open navigation menu"
        >
          <Menu size={20} />
        </button>

        <h1
          className="text-xl font-semibold text-[var(--color-foreground)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {title}
        </h1>
      </div>

      <Button variant="primary" size="sm" onClick={onNewProject}>
        <Plus size={15} />
        <span className="hidden sm:inline">New Project</span>
      </Button>
    </header>
  );
}
