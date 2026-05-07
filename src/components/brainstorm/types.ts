export const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🎉", "🚀", "💡"] as const;
export type Emoji = (typeof REACTION_EMOJIS)[number];

export type Message = {
  id: string;
  user_id: string;
  user_display_name: string;
  content: string;
  reply_to_id: string | null;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
};

export type Reaction = {
  id: string;
  message_id: string;
  user_id: string;
  emoji: Emoji;
  created_at: string;
};

export type AdminUser = {
  id: string;
  display_name: string | null;
  email: string | null;
  avatar_url: string | null;
};

export type ReadState = {
  user_id: string;
  last_read_at: string;
};