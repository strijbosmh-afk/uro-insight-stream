export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          after: Json | null
          before: Json | null
          created_at: string
          id: string
          summary: string | null
          target_id: string | null
          target_type: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          id?: string
          summary?: string | null
          target_id?: string | null
          target_type: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          id?: string
          summary?: string | null
          target_id?: string | null
          target_type?: string
        }
        Relationships: []
      }
      hashtags: {
        Row: {
          active: boolean
          congress_id: string | null
          created_at: string
          id: string
          tag: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          congress_id?: string | null
          created_at?: string
          id: string
          tag: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          congress_id?: string | null
          created_at?: string
          id?: string
          tag?: string
          updated_at?: string
        }
        Relationships: []
      }
      ingestion_config: {
        Row: {
          adapter: string
          default_lookback_minutes: number
          enabled: boolean
          id: number
          poll_interval_minutes: number
          rate_limit_per_15min: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          adapter?: string
          default_lookback_minutes?: number
          enabled?: boolean
          id?: number
          poll_interval_minutes?: number
          rate_limit_per_15min?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          adapter?: string
          default_lookback_minutes?: number
          enabled?: boolean
          id?: number
          poll_interval_minutes?: number
          rate_limit_per_15min?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      ingestion_runs: {
        Row: {
          adapter: string
          error_message: string | null
          finished_at: string | null
          id: string
          started_at: string
          status: string
          target: string
          target_type: string
          triggered_by: string | null
          tweets_fetched: number
          tweets_inserted: number
        }
        Insert: {
          adapter: string
          error_message?: string | null
          finished_at?: string | null
          id?: string
          started_at?: string
          status: string
          target: string
          target_type: string
          triggered_by?: string | null
          tweets_fetched?: number
          tweets_inserted?: number
        }
        Update: {
          adapter?: string
          error_message?: string | null
          finished_at?: string | null
          id?: string
          started_at?: string
          status?: string
          target?: string
          target_type?: string
          triggered_by?: string | null
          tweets_fetched?: number
          tweets_inserted?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          active: boolean
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string
          id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email: string
          id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      sources: {
        Row: {
          active: boolean
          avatar_url: string
          created_at: string
          display_name: string
          handle: string
          id: string
          last_seen_at: string | null
          list_ids: string[]
          role: string
          specialty: string[]
          tweet_count: number
          updated_at: string
          verified: boolean
        }
        Insert: {
          active?: boolean
          avatar_url?: string
          created_at?: string
          display_name: string
          handle: string
          id: string
          last_seen_at?: string | null
          list_ids?: string[]
          role?: string
          specialty?: string[]
          tweet_count?: number
          updated_at?: string
          verified?: boolean
        }
        Update: {
          active?: boolean
          avatar_url?: string
          created_at?: string
          display_name?: string
          handle?: string
          id?: string
          last_seen_at?: string | null
          list_ids?: string[]
          role?: string
          specialty?: string[]
          tweet_count?: number
          updated_at?: string
          verified?: boolean
        }
        Relationships: []
      }
      tweets: {
        Row: {
          abstract_id: string | null
          author_display_name: string | null
          author_handle: string
          congress_id: string | null
          created_at: string
          hashtags: string[]
          id: string
          ingested_at: string
          lang: string | null
          like_count: number
          media_urls: string[]
          raw: Json | null
          reply_count: number
          retweet_count: number
          session_id: string | null
          source_id: string | null
          text: string
        }
        Insert: {
          abstract_id?: string | null
          author_display_name?: string | null
          author_handle: string
          congress_id?: string | null
          created_at: string
          hashtags?: string[]
          id: string
          ingested_at?: string
          lang?: string | null
          like_count?: number
          media_urls?: string[]
          raw?: Json | null
          reply_count?: number
          retweet_count?: number
          session_id?: string | null
          source_id?: string | null
          text: string
        }
        Update: {
          abstract_id?: string | null
          author_display_name?: string | null
          author_handle?: string
          congress_id?: string | null
          created_at?: string
          hashtags?: string[]
          id?: string
          ingested_at?: string
          lang?: string | null
          like_count?: number
          media_urls?: string[]
          raw?: Json | null
          reply_count?: number
          retweet_count?: number
          session_id?: string | null
          source_id?: string | null
          text?: string
        }
        Relationships: []
      }
      user_ai_settings: {
        Row: {
          created_at: string
          language: string
          max_bullets: number
          model: string
          prompt_template: string | null
          tone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          language?: string
          max_bullets?: number
          model?: string
          prompt_template?: string | null
          tone?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          language?: string
          max_bullets?: number
          model?: string
          prompt_template?: string | null
          tone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_preferences: {
        Row: {
          created_at: string
          default_congress_id: string | null
          default_source_list_id: string | null
          polling_interval_seconds: number
          summary_language: string
          summary_tone: string
          theme_density: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          default_congress_id?: string | null
          default_source_list_id?: string | null
          polling_interval_seconds?: number
          summary_language?: string
          summary_tone?: string
          theme_density?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          default_congress_id?: string | null
          default_source_list_id?: string | null
          polling_interval_seconds?: number
          summary_language?: string
          summary_tone?: string
          theme_density?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          granted_by: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          granted_by?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          granted_by?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "editor" | "viewer"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "editor", "viewer"],
    },
  },
} as const
