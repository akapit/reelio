"use client";

import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";
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
}

export function Header({ onNewProject }: HeaderProps) {
  const pathname = usePathname();
  const title = getPageTitle(pathname);

  return (
    <header className="h-16 shrink-0 flex items-center justify-between px-8 bg-[var(--color-surface)] border-b border-[var(--color-border)]">
      <h1
        className="text-xl font-semibold text-[var(--color-foreground)]"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {title}
      </h1>

      <Button variant="primary" size="sm" onClick={onNewProject}>
        <Plus size={15} />
        New Project
      </Button>
    </header>
  );
}
