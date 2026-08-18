"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { MoreHorizontal, Plus } from "lucide-react";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import LoadingIndicator from "@/components/loading-indicator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { db, type Session } from "@/lib/db";

interface GroupedSessions {
  type: "today" | "last 7 days" | "last 30 days" | "earlier";
  sessions: Session[];
}

const AppSidebar = () => {
  const { session_id } = useParams();
  const router = useRouter();
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [sessionId, setSessionId] = useState("");
  const pathname = usePathname();

  const sessions = useLiveQuery(() =>
    db.session.limit(100).reverse().sortBy("updatedAt"),
  );

  const groupedSessions =
    sessions?.reduce((groups, session) => {
      const now = new Date();
      const updatedAt = new Date(session.updatedAt);
      const diffTime = now.getTime() - updatedAt.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

      let groupType: GroupedSessions["type"];
      if (diffDays === 0) {
        groupType = "today";
      } else if (diffDays <= 7) {
        groupType = "last 7 days";
      } else if (diffDays <= 30) {
        groupType = "last 30 days";
      } else {
        groupType = "earlier";
      }

      const group = groups.find((g) => g.type === groupType);
      if (group) {
        group.sessions.push(session);
      } else {
        groups.push({ type: groupType, sessions: [session] });
      }
      return groups;
    }, [] as GroupedSessions[]) ?? [];

  const handleDelete = async () => {
    await db.transaction("rw", db.session, db.message, async () => {
      await db.session.delete(sessionId);
      await db.message.where("sessionId").equals(sessionId).delete();
    });
    setDeleteConfirmOpen(false);
    router.push("/");
  };

  return (
    <>
      <Sidebar collapsible="icon">
        <SidebarHeader className="gap-3 p-1.5 pt-3">
          <div className="flex min-w-0 items-center justify-between overflow-hidden group-data-[collapsible=icon]:justify-center">
            <span className="shrink-0 text-lg font-semibold text-[var(--dsw-alias-label-primary)] group-data-[collapsible=icon]:hidden">
              Hcz Chat
            </span>
            <SidebarTrigger className="group-data-[collapsible=icon]:hidden" />
          </div>
          <Link
            href="/"
            className="flex h-[38px] items-center justify-center gap-1.5 rounded-xl border border-[var(--dsw-alias-border-l2)] bg-[var(--dsw-alias-button-elevated-fill)] px-4 text-sm font-medium text-[var(--dsw-alias-label-primary)] transition-colors hover:bg-[var(--dsw-alias-button-floating-hover)] group-data-[collapsible=icon]:size-9 group-data-[collapsible=icon]:self-center group-data-[collapsible=icon]:gap-0 group-data-[collapsible=icon]:rounded-lg group-data-[collapsible=icon]:border-transparent group-data-[collapsible=icon]:px-0"
          >
            <Plus className="size-4 shrink-0" />
            <span className="group-data-[collapsible=icon]:hidden">
              New Session
            </span>
          </Link>
        </SidebarHeader>

        <SidebarContent>
          {groupedSessions.map(({ type, sessions }) => (
            <SidebarGroup key={type}>
              <SidebarGroupLabel className="px-2 text-xs font-medium uppercase tracking-wide text-[var(--dsw-alias-label-caption)]">
                {type}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {sessions.map(({ id, name }) => (
                    <SidebarMenuItem key={id}>
                      <SidebarMenuButton
                        asChild
                        isActive={session_id === id}
                        className="h-8 rounded-lg px-2 text-sm text-[var(--dsw-alias-label-primary)] hover:bg-[var(--dsw-specific-sidebar-nav-item-hover)] hover:text-[var(--dsw-alias-label-primary)] data-[active=true]:bg-[var(--dsw-specific-sidebar-nav-item-active)] data-[active=true]:text-[var(--dsw-alias-label-primary)]"
                      >
                        <Link href={`/c/${id}`}>
                          {name}
                          <LoadingIndicator className="ml-auto" />
                        </Link>
                      </SidebarMenuButton>

                      {session_id === id && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <SidebarMenuAction>
                              <MoreHorizontal />
                            </SidebarMenuAction>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent side="right" align="start">
                            <DropdownMenuItem
                              onClick={() => {
                                setDeleteConfirmOpen(true);
                                setSessionId(id);
                              }}
                            >
                              <span className="text-destructive">Delete</span>
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </SidebarContent>

        <SidebarRail />
      </Sidebar>

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Are you sure you want to delete this session?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default AppSidebar;
