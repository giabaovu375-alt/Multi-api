import { useEffect, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Plus, Trash2, Folder, Settings2 } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { loadProjects, deleteProject, type Project } from "@/lib/storage";
import { cn } from "@/lib/utils";
import { ProviderSettingsDialog } from "@/components/provider-settings-dialog";

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [projects, setProjects] = useState<Project[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    setProjects(loadProjects());
    const onStorage = () => setProjects(loadProjects());
    window.addEventListener("storage", onStorage);
    window.addEventListener("forge:projects-changed", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("forge:projects-changed", onStorage);
    };
  }, []);

  const onDelete = (id: string) => {
    deleteProject(id);
    setProjects(loadProjects());
    window.dispatchEvent(new Event("forge:projects-changed"));
    if (pathname.includes(id)) navigate({ to: "/" });
  };

  return (
    <Sidebar collapsible="icon" className="border-r border-border/60">
      <SidebarHeader>
        <Link
          to="/"
          className={cn(
            "flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-sidebar-accent transition",
            collapsed && "justify-center",
          )}
        >
          <div className="grid place-items-center h-7 w-7 rounded-md bg-primary text-primary-foreground font-mono text-xs font-bold">
            F
          </div>
          {!collapsed && (
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-semibold">forge.dev</span>
              <span className="text-[10px] text-muted-foreground">AI Coding</span>
            </div>
          )}
        </Link>
        <Button
          asChild
          size="sm"
          className={cn("mt-2 gap-2", collapsed && "px-0")}
        >
          <Link to="/">
            <Plus className="h-4 w-4" />
            {!collapsed && <span>New project</span>}
          </Link>
        </Button>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          {!collapsed && <SidebarGroupLabel>Projects</SidebarGroupLabel>}
          <SidebarGroupContent>
            <SidebarMenu>
              {projects.length === 0 && !collapsed && (
                <p className="px-3 py-2 text-xs text-muted-foreground">
                  No projects yet. Start one from the home page.
                </p>
              )}
              {projects.map((p) => {
                const href = `/project/${p.id}`;
                const active = pathname === href;
                return (
                  <SidebarMenuItem key={p.id}>
                    <div
                      className={cn(
                        "group flex items-center gap-1 rounded-md px-2 py-1.5 text-sm transition",
                        active
                          ? "bg-sidebar-accent text-sidebar-accent-foreground"
                          : "hover:bg-sidebar-accent/60",
                      )}
                    >
                      <Link
                        to="/project/$projectId"
                        params={{ projectId: p.id }}
                        className="flex flex-1 items-center gap-2 min-w-0"
                      >
                        <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
                        {!collapsed && (
                          <span className="truncate">{p.title || "Untitled"}</span>
                        )}
                      </Link>
                      {!collapsed && (
                        <button
                          type="button"
                          aria-label="Delete project"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onDelete(p.id);
                          }}
                          className="opacity-0 group-hover:opacity-100 transition text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <Button
          variant="ghost"
          size="sm"
          className={cn("justify-start gap-2", collapsed && "justify-center px-0")}
          onClick={() => setSettingsOpen(true)}
        >
          <Settings2 className="h-4 w-4" />
          {!collapsed && <span>Providers</span>}
        </Button>
        <ProviderSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      </SidebarFooter>
    </Sidebar>
  );
}