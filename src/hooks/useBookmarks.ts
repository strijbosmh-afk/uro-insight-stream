import * as React from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";

export type Bookmark = {
  id: string;
  user_id: string;
  tweet_id: string;
  note: string | null;
  created_at: string;
  updated_at: string;
};

export type BookmarkFilter = {
  search?: string;
  withNotesOnly?: boolean;
  sourceId?: string;
  since?: string;
  until?: string;
};

/** Fetch all bookmarks for the current user. */
export function useBookmarks(filter?: BookmarkFilter) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["bookmarks", user?.id, filter ?? null],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_bookmarks")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      let rows = (data ?? []) as Bookmark[];
      if (filter?.withNotesOnly) {
        rows = rows.filter((r) => (r.note ?? "").trim().length > 0);
      }
      if (filter?.since) rows = rows.filter((r) => r.created_at >= filter.since!);
      if (filter?.until) rows = rows.filter((r) => r.created_at <= filter.until!);
      return rows;
    },
  });
}

/** Returns whether the current user has bookmarked a particular tweet. */
export function useIsBookmarked(tweetId: string | undefined) {
  const { user } = useAuth();
  const q = useQuery({
    queryKey: ["bookmark-state", tweetId, user?.id],
    enabled: !!user && !!tweetId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_bookmarks")
        .select("*")
        .eq("tweet_id", tweetId!)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data ?? null) as Bookmark | null;
    },
  });
  return {
    isBookmarked: !!q.data,
    bookmark: q.data ?? null,
    isLoading: q.isLoading,
  };
}

/** Toggle bookmark state with optimistic UI. */
export function useToggleBookmark() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: { tweetId: string; bookmarked: boolean }) => {
      if (!user) throw new Error("Sign in required");
      if (input.bookmarked) {
        const { data, error } = await supabase
          .from("user_bookmarks")
          .insert({ user_id: user.id, tweet_id: input.tweetId })
          .select("*")
          .single();
        if (error) throw new Error(error.message);
        return data as Bookmark;
      } else {
        const { error } = await supabase
          .from("user_bookmarks")
          .delete()
          .eq("user_id", user.id)
          .eq("tweet_id", input.tweetId);
        if (error) throw new Error(error.message);
        return null;
      }
    },
    onMutate: async (input) => {
      await qc.cancelQueries({
        queryKey: ["bookmark-state", input.tweetId, user?.id],
      });
      const prev = qc.getQueryData<Bookmark | null>([
        "bookmark-state",
        input.tweetId,
        user?.id,
      ]);
      qc.setQueryData<Bookmark | null>(
        ["bookmark-state", input.tweetId, user?.id],
        input.bookmarked
          ? ({
              id: "optimistic",
              user_id: user?.id ?? "",
              tweet_id: input.tweetId,
              note: null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            } as Bookmark)
          : null,
      );
      return { prev };
    },
    onError: (_e, input, ctx) => {
      qc.setQueryData(
        ["bookmark-state", input.tweetId, user?.id],
        ctx?.prev ?? null,
      );
    },
    onSettled: (_d, _e, input) => {
      qc.invalidateQueries({
        queryKey: ["bookmark-state", input.tweetId, user?.id],
      });
      qc.invalidateQueries({ queryKey: ["bookmarks"] });
    },
  });
}

/** Inline note edits with optimistic write-through. */
export function useUpdateBookmarkNote() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: { tweetId: string; note: string | null }) => {
      if (!user) throw new Error("Sign in required");
      const { data, error } = await supabase
        .from("user_bookmarks")
        .update({ note: input.note, updated_at: new Date().toISOString() })
        .eq("user_id", user.id)
        .eq("tweet_id", input.tweetId)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return data as Bookmark;
    },
    onMutate: async (input) => {
      await qc.cancelQueries({
        queryKey: ["bookmark-state", input.tweetId, user?.id],
      });
      const prev = qc.getQueryData<Bookmark | null>([
        "bookmark-state",
        input.tweetId,
        user?.id,
      ]);
      if (prev) {
        qc.setQueryData<Bookmark | null>(
          ["bookmark-state", input.tweetId, user?.id],
          { ...prev, note: input.note },
        );
      }
      return { prev };
    },
    onError: (_e, input, ctx) => {
      qc.setQueryData(
        ["bookmark-state", input.tweetId, user?.id],
        ctx?.prev ?? null,
      );
    },
    onSettled: (_d, _e, input) => {
      qc.invalidateQueries({
        queryKey: ["bookmark-state", input.tweetId, user?.id],
      });
      qc.invalidateQueries({ queryKey: ["bookmarks"] });
    },
  });
}

/** Returns true if the user added any bookmark in the last 24h. */
export function useHasRecentBookmarks() {
  const { data } = useBookmarks();
  return React.useMemo(() => {
    if (!data || data.length === 0) return false;
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    return data.some((b) => new Date(b.created_at).getTime() > cutoff);
  }, [data]);
}