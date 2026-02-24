import { useState } from 'react';
import { Plus, MessageSquare, Sparkles, ChevronLeft, ChevronRight, Search, Trash2, Pencil, Pin, PinOff, MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ChatConversation } from '@/types/chat';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';

interface SidebarProps {
  conversations: ChatConversation[];
  activeConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
  onOpenSearch: () => void;
  isCollapsed: boolean;
  onToggle: () => void;
  onDeleteConversation: (id: string) => void;
  onRenameConversation: (id: string, newTitle: string) => void;
  onTogglePinConversation: (id: string) => void;
}

export function Sidebar({
  conversations,
  activeConversationId,
  onSelectConversation,
  onNewConversation,
  onOpenSearch,
  isCollapsed,
  onToggle,
  onDeleteConversation,
  onRenameConversation,
  onTogglePinConversation,
}: SidebarProps) {
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [renamingConvId, setRenamingConvId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingConvId, setDeletingConvId] = useState<string | null>(null);

  const handleRenameClick = (conv: ChatConversation) => {
    setRenamingConvId(conv.id);
    setRenameValue(conv.title);
    setRenameDialogOpen(true);
  };

  const handleRenameSubmit = () => {
    if (renamingConvId && renameValue.trim()) {
      onRenameConversation(renamingConvId, renameValue.trim());
    }
    setRenameDialogOpen(false);
    setRenamingConvId(null);
    setRenameValue('');
  };

  const handleDeleteClick = (convId: string) => {
    setDeletingConvId(convId);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = () => {
    if (deletingConvId) {
      onDeleteConversation(deletingConvId);
    }
    setDeleteDialogOpen(false);
    setDeletingConvId(null);
  };

  return (
    <>
      <aside className={cn(
        "border-r border-border bg-sidebar flex flex-col h-full transition-all duration-300 ease-out",
        isCollapsed ? "w-16" : "w-80"
      )}>
        {/* New Chat Button */}
        <div className="p-3 space-y-2">
          <Button
            onClick={onNewConversation}
            className={cn(
              "gap-2 bg-primary hover:bg-primary/90 text-foreground shadow-lg shadow-primary/20 transition-all",
              isCollapsed ? "w-10 h-10 p-0" : "w-full"
            )}
          >
            <Plus className="w-4 h-4" />
            {!isCollapsed && <span>New Chat</span>}
          </Button>

          {/* Search Button */}
          <Button
            onClick={onOpenSearch}
            variant="outline"
            className={cn(
              "gap-2 border-sidebar-border text-sidebar-foreground hover:bg-sidebar-accent transition-all",
              isCollapsed ? "w-10 h-10 p-0" : "w-full justify-start"
            )}
          >
            <Search className="w-4 h-4" />
            {!isCollapsed && (
              <>
                <span className="flex-1 text-left">Search</span>
                {/* <kbd className="text-xs bg-sidebar-accent px-1.5 py-0.5 rounded text-muted-foreground"></kbd> */}
              </>
            )}
          </Button>
        </div>

        {/* History Header */}
        {!isCollapsed && (
          <div className="px-4 pb-2 pt-2">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Search History
            </h3>
          </div>
        )}

        {/* Conversations List */}
        {!isCollapsed && (
          <ScrollArea className="flex-1 px-2">
            <div className="space-y-1 pb-4">
              {conversations.map((conv) => (
                <div
                  key={conv.id}
                  className={cn(
                    'relative w-full rounded-xl transition-all duration-200 group flex items-center',
                    conv.id === activeConversationId
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground shadow-sm'
                      : 'hover:bg-sidebar-accent/50 text-sidebar-foreground'
                  )}
                >
                  <button
                    onClick={() => onSelectConversation(conv.id)}
                    className="flex-1 text-left pl-3 pr-9 py-2.5 flex items-center gap-3 min-w-0"
                  >
                    {conv.isPinned ? (
                      <Pin className="w-4 h-4 shrink-0 text-primary" />
                    ) : (
                      <MessageSquare className="w-4 h-4 shrink-0 opacity-60" />
                    )}
                    <span className="truncate text-sm">{conv.title}</span>
                  </button>

                  {/* Direct Action Buttons */}
                  <div className={cn(
                    "absolute right-14 top-1/2 -translate-y-1/2 flex items-center gap-1 bg-gradient-to-l from-sidebar-accent via-sidebar-accent/80 to-transparent pl-6 pr-2 py-1 z-50",
                    "opacity-0 group-hover:opacity-100 transition-all duration-200"
                  )}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onTogglePinConversation(conv.id);
                      }}
                      className="p-1.5 rounded-md hover:bg-black/10 dark:hover:bg-white/10 text-muted-foreground hover:text-primary transition-colors"
                      title={conv.isPinned ? "Unpin" : "Pin"}
                    >
                      {conv.isPinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRenameClick(conv);
                      }}
                      className="p-1.5 rounded-md hover:bg-black/10 dark:hover:bg-white/10 text-muted-foreground hover:text-blue-500 transition-colors"
                      title="Rename"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteClick(conv.id);
                      }}
                      className="p-1.5 rounded-md hover:bg-black/10 dark:hover:bg-white/10 text-muted-foreground hover:text-destructive transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}

        {/* Collapsed state - show icons */}
        {isCollapsed && (
          <ScrollArea className="flex-1">
            <div className="flex flex-col items-center gap-2 py-2">
              {conversations.slice(0, 5).map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => onSelectConversation(conv.id)}
                  className={cn(
                    'w-10 h-10 rounded-xl flex items-center justify-center transition-colors relative',
                    conv.id === activeConversationId
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                      : 'hover:bg-sidebar-accent/50 text-sidebar-foreground'
                  )}
                >
                  {conv.isPinned ? (
                    <Pin className="w-4 h-4 text-primary" />
                  ) : (
                    <MessageSquare className="w-4 h-4" />
                  )}
                </button>
              ))}
            </div>
          </ScrollArea>
        )}

        {/* Logo Section with Toggle */}
        <div className="p-4 border-t border-sidebar-border">
          <div className={cn(
            "flex items-center",
            isCollapsed ? "flex-col gap-2" : "gap-4 px-2"
          )}>
            <div className="flex items-center justify-center">
              <img
                src="/GETIT logo black.png"
                alt="GetIT Logo"
                className={cn("w-auto dark:hidden", isCollapsed ? "h-8" : "h-16")}
              />
              <img
                src="/GETIT logo white.png"
                alt="GetIT Logo"
                className={cn("w-auto hidden dark:block", isCollapsed ? "h-8" : "h-16")}
              />
            </div>
            {!isCollapsed && (
              <div className="flex-1">
                <h3 className="font-semibold text-base text-sidebar-foreground">GetIT GenAI</h3>
                <p className="text-sm text-muted-foreground">AI-Powered RAG</p>
              </div>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggle}
              className="h-9 w-9 text-sidebar-foreground hover:bg-sidebar-accent"
            >
              {isCollapsed ? (
                <ChevronRight className="h-4 w-4" />
              ) : (
                <ChevronLeft className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </aside>

      {/* Rename Dialog */}
      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rename conversation</DialogTitle>
            <DialogDescription>Enter a new name for this conversation.</DialogDescription>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            placeholder="Enter new name"
            onKeyDown={(e) => e.key === 'Enter' && handleRenameSubmit()}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleRenameSubmit}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the conversation and all its messages.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
