import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Lightbulb, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
  TooltipProvider,
} from "@/components/ui/tooltip";
import { MessageList, type MessageListHandle } from "@/components/brainstorm/MessageList";
import { PresenceList } from "@/components/brainstorm/PresenceList";
import { Composer, type ComposerHandle } from "@/components/brainstorm/Composer";
import { useBrainstormMessages } from "@/hooks/useBrainstormMessages";
import { useBrainstormReactions } from "@/hooks/useBrainstormReactions";
import { useBrainstormReadState } from "@/hooks/useBrainstormReadState";
import { useBrainstormPresence } from "@/hooks/useBrainstormPresence";
import { useBrainstormAdmins } from "@/hooks/useBrainstormAdmins";
import {
  type Emoji,
  type Message,
} from "@/components/brainstorm/types";

export const Route = createFileRoute("/configuration/brainstorm")({
  head: () => ({ meta: [{ title: "Brainstorm — UroFeed" }] }),
  component: BrainstormPage,
});

function BrainstormPage() {
  const { isAdmin, loading, user, profile } = useAuth();
  const navigate = useNavigate();

  React.useEffect(() => {
    if (!loading && !isAdmin) {
      toast.error("Not authorized");
      void navigate({ to: "/dashboard" });
    }
  }, [loading, isAdmin, navigate]);

  if (loading || !isAdmin || !user) {
    return <div className="p-6 text-text-muted text-sm">Loading…</div>;
  }

  return (
    <ChatRoom
      currentUserId={user.id}
      currentDisplayName={profile?.display_name ?? user.email ?? "Admin"}
    />
  );
}

function ChatRoom({
  currentUserId,
  currentDisplayName,
}: {
  currentUserId: string;
  currentDisplayName: string;
}) {
  const {
    messages,
    isLoading: loading,
    sendMessage,
    editMessage,
    deleteMessage,
  } = useBrainstormMessages(currentUserId);
  const { reactions, toggleReaction } = useBrainstormReactions(currentUserId);
  const latestMessageId = messages.length > 0 ? messages[messages.length - 1].id : null;
  const { getReadersFor } = useBrainstormReadState(currentUserId, latestMessageId);
  const { onlineIds, typingUsers, broadcastTyping } = useBrainstormPresence(
    currentUserId,
    currentDisplayName,
  );
  const { admins, displayNameFor } = useBrainstormAdmins();
  const [replyTo, setReplyTo] = React.useState<Message | null>(null);
  const [editing, setEditing] = React.useState<Message | null>(null);
  const [search, setSearch] = React.useState("");
  const [showSearch, setShowSearch] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState<Message | null>(null);

  const messageListRef = React.useRef<MessageListHandle>(null);
  const composerRef = React.useRef<ComposerHandle>(null);

  const onType = () => broadcastTyping(true);

  const handleSend = async (content: string): Promise<boolean> => {
    broadcastTyping(false);
    const result = await sendMessage(content, {
      userId: currentUserId,
      displayName: currentDisplayName,
      replyToId: replyTo?.id ?? null,
    });
    if (result.success) setReplyTo(null);
    return result.success;
  };

  const handleSaveEdit = async (
    messageId: string,
    content: string,
  ): Promise<boolean> => {
    const original = messages.find((x) => x.id === messageId);
    // Clear edit state optimistically; hook handles message-state rollback.
    setEditing(null);
    const result = await editMessage(messageId, content);
    if (!result.success) {
      if (original) setEditing(original);
      return false;
    }
    return true;
  };

  const handleReact = (m: Message, emoji: Emoji) => {
    void toggleReaction(m.id, emoji);
  };

  const startEdit = (m: Message) => {
    setEditing(m);
    setReplyTo(null);
  };

  const startReply = (m: Message) => {
    setReplyTo(m);
    setEditing(null);
  };

  const doDelete = async (m: Message) => {
    setConfirmDelete(null);
    await deleteMessage(m.id);
  };

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-full min-h-0 -m-3 sm:-m-3">
        <div className="flex flex-col flex-1 min-w-0 min-h-0">
          {/* Header */}
          <div className="flex items-center justify-between px-4 h-14 border-b border-border bg-panel shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-md bg-accent/10 border border-accent/40 flex items-center justify-center">
              <Lightbulb className="w-4 h-4 text-accent" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-semibold text-text-primary">Brainstorm</h1>
                <Badge variant="outline" className="border-success/40 text-success text-[10px]">
                  {onlineIds.size} online
                </Badge>
              </div>
              <p className="text-xs text-text-muted">Discuss improvements with the team</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {showSearch && (
              <Input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search messages…"
                className="h-8 w-56"
              />
            )}
            <Button
              variant="ghost"
              size="icon"
              aria-label="Search messages"
              onClick={() => {
                setShowSearch((v) => !v);
                if (showSearch) setSearch("");
              }}
            >
              <Search className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Messages */}
        <MessageList
          ref={messageListRef}
          messages={messages}
          reactions={reactions}
          search={search}
          loading={loading}
          currentUserId={currentUserId}
          totalOtherAdmins={Math.max(admins.length - 1, 0)}
          getReadersFor={getReadersFor}
          displayNameFor={displayNameFor}
          onReply={startReply}
          onEdit={startEdit}
          onDelete={(m) => setConfirmDelete(m)}
          onReact={handleReact}
        />

        {/* Typing indicator */}
        {typingUsers.length > 0 && (
          <div className="px-4 py-1 text-xs italic text-text-muted shrink-0">
            {typingUsers.length === 1
              ? `${typingUsers[0]} is typing…`
              : `${typingUsers.length} people are typing…`}
          </div>
        )}

        <Composer
          ref={composerRef}
          replyTo={replyTo}
          editing={editing}
          displayNameFor={displayNameFor}
          onSend={handleSend}
          onSaveEdit={handleSaveEdit}
          onCancelReply={() => setReplyTo(null)}
          onCancelEdit={() => setEditing(null)}
          onType={onType}
        />

        <AlertDialog
          open={!!confirmDelete}
          onOpenChange={(o) => !o && setConfirmDelete(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete message?</AlertDialogTitle>
              <AlertDialogDescription>
                This message will be removed for everyone. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => confirmDelete && void doDelete(confirmDelete)}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        </div>

        <PresenceList
          admins={admins}
          onlineIds={onlineIds}
          currentUserId={currentUserId}
        />
      </div>
    </TooltipProvider>
  );
}
