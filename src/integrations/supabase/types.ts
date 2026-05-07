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
      abstracts: {
        Row: {
          abstract_number: string
          authors: string[]
          created_at: string
          id: string
          institution: string
          seeded_from_mock: boolean
          session_id: string
          title: string
          updated_at: string
        }
        Insert: {
          abstract_number?: string
          authors?: string[]
          created_at?: string
          id: string
          institution?: string
          seeded_from_mock?: boolean
          session_id: string
          title: string
          updated_at?: string
        }
        Update: {
          abstract_number?: string
          authors?: string[]
          created_at?: string
          id?: string
          institution?: string
          seeded_from_mock?: boolean
          session_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      access_requests: {
        Row: {
          created_at: string
          email: string
          id: string
          name: string | null
          reason: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          name?: string | null
          reason?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          name?: string | null
          reason?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      admin_audit_log: {
        Row: {
          action: string
          actor_user_id: string
          created_at: string
          id: string
          metadata: Json | null
          target_email: string | null
          target_user_id: string | null
        }
        Insert: {
          action: string
          actor_user_id: string
          created_at?: string
          id?: string
          metadata?: Json | null
          target_email?: string | null
          target_user_id?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          target_email?: string | null
          target_user_id?: string | null
        }
        Relationships: []
      }
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
      brainstorm_message_reactions: {
        Row: {
          created_at: string
          emoji: string
          id: string
          message_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          id?: string
          message_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "brainstorm_message_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "brainstorm_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      brainstorm_messages: {
        Row: {
          content: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          id: string
          reply_to_id: string | null
          user_display_name: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          reply_to_id?: string | null
          user_display_name: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          reply_to_id?: string | null
          user_display_name?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "brainstorm_messages_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "brainstorm_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      brainstorm_read_state: {
        Row: {
          last_read_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          last_read_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          last_read_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      cancer_area_signals: {
        Row: {
          cancer_area_id: string
          created_at: string
          id: string
          is_active: boolean
          notes: string | null
          signal_type: string
          updated_at: string
          value: string
          weight: number
        }
        Insert: {
          cancer_area_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          signal_type: string
          updated_at?: string
          value: string
          weight?: number
        }
        Update: {
          cancer_area_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          signal_type?: string
          updated_at?: string
          value?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "cancer_area_signals_cancer_area_id_fkey"
            columns: ["cancer_area_id"]
            isOneToOne: false
            referencedRelation: "cancer_areas"
            referencedColumns: ["id"]
          },
        ]
      }
      cancer_areas: {
        Row: {
          created_at: string
          display_order: number
          id: string
          is_system: boolean
          name: string
          short_description: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          is_system?: boolean
          name: string
          short_description?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          is_system?: boolean
          name?: string
          short_description?: string | null
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      congress_cancer_areas: {
        Row: {
          cancer_area_id: string
          congress_id: string
          created_at: string
          is_primary: boolean
        }
        Insert: {
          cancer_area_id: string
          congress_id: string
          created_at?: string
          is_primary?: boolean
        }
        Update: {
          cancer_area_id?: string
          congress_id?: string
          created_at?: string
          is_primary?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "congress_cancer_areas_cancer_area_id_fkey"
            columns: ["cancer_area_id"]
            isOneToOne: false
            referencedRelation: "cancer_areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "congress_cancer_areas_congress_id_fkey"
            columns: ["congress_id"]
            isOneToOne: false
            referencedRelation: "congresses"
            referencedColumns: ["id"]
          },
        ]
      }
      congress_featured_sources: {
        Row: {
          added_at: string
          added_by: string | null
          congress_id: string
          display_order: number
          role: string | null
          source_id: string
        }
        Insert: {
          added_at?: string
          added_by?: string | null
          congress_id: string
          display_order?: number
          role?: string | null
          source_id: string
        }
        Update: {
          added_at?: string
          added_by?: string | null
          congress_id?: string
          display_order?: number
          role?: string | null
          source_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "congress_featured_sources_congress_id_fkey"
            columns: ["congress_id"]
            isOneToOne: false
            referencedRelation: "congresses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "congress_featured_sources_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      congress_lookup_cache: {
        Row: {
          expires_at: string
          fetched_at: string
          query_hash: string
          query_raw: string
          result: Json
        }
        Insert: {
          expires_at?: string
          fetched_at?: string
          query_hash: string
          query_raw: string
          result: Json
        }
        Update: {
          expires_at?: string
          fetched_at?: string
          query_hash?: string
          query_raw?: string
          result?: Json
        }
        Relationships: []
      }
      congress_suggestion_cache: {
        Row: {
          created_at: string
          hits: number
          query_normalized: string
          response_json: Json
        }
        Insert: {
          created_at?: string
          hits?: number
          query_normalized: string
          response_json: Json
        }
        Update: {
          created_at?: string
          hits?: number
          query_normalized?: string
          response_json?: Json
        }
        Relationships: []
      }
      congresses: {
        Row: {
          city: string | null
          community_hashtags: string[]
          country: string | null
          created_at: string
          created_by: string | null
          description: string | null
          end_date: string | null
          id: string
          name: string
          primary_hashtags: string[]
          seeded_from_mock: boolean
          short_code: string
          start_date: string | null
          status: string
          updated_at: string
          website: string | null
        }
        Insert: {
          city?: string | null
          community_hashtags?: string[]
          country?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          name: string
          primary_hashtags?: string[]
          seeded_from_mock?: boolean
          short_code: string
          start_date?: string | null
          status?: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          city?: string | null
          community_hashtags?: string[]
          country?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          name?: string
          primary_hashtags?: string[]
          seeded_from_mock?: boolean
          short_code?: string
          start_date?: string | null
          status?: string
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      digest_subscription_recipients: {
        Row: {
          created_at: string
          digest_id: string
          email: string
          id: string
          is_default: boolean
        }
        Insert: {
          created_at?: string
          digest_id: string
          email: string
          id?: string
          is_default?: boolean
        }
        Update: {
          created_at?: string
          digest_id?: string
          email?: string
          id?: string
          is_default?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "digest_subscription_recipients_digest_id_fkey"
            columns: ["digest_id"]
            isOneToOne: false
            referencedRelation: "digest_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      digest_subscription_sources: {
        Row: {
          created_at: string
          digest_id: string
          source_id: string
        }
        Insert: {
          created_at?: string
          digest_id: string
          source_id: string
        }
        Update: {
          created_at?: string
          digest_id?: string
          source_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "digest_subscription_sources_digest_id_fkey"
            columns: ["digest_id"]
            isOneToOne: false
            referencedRelation: "digest_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      digest_subscriptions: {
        Row: {
          created_at: string
          day_of_week: number | null
          frequency: string
          id: string
          is_active: boolean
          last_sent_at: string | null
          name: string
          next_send_at: string
          send_hour: number
          timezone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          day_of_week?: number | null
          frequency: string
          id?: string
          is_active?: boolean
          last_sent_at?: string | null
          name: string
          next_send_at: string
          send_hour?: number
          timezone?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          day_of_week?: number | null
          frequency?: string
          id?: string
          is_active?: boolean
          last_sent_at?: string | null
          name?: string
          next_send_at?: string
          send_hour?: number
          timezone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
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
      ingest_queue: {
        Row: {
          attempts: number
          enrichment_status: string
          error_message: string | null
          finished_at: string | null
          id: string
          job_payload: Json | null
          job_type: string
          last_processed_at: string | null
          priority: number
          rate_limited_until: string | null
          requested_at: string
          requested_by: string | null
          since: string
          source_id: string
          started_at: string | null
          status: string
        }
        Insert: {
          attempts?: number
          enrichment_status?: string
          error_message?: string | null
          finished_at?: string | null
          id?: string
          job_payload?: Json | null
          job_type?: string
          last_processed_at?: string | null
          priority?: number
          rate_limited_until?: string | null
          requested_at?: string
          requested_by?: string | null
          since?: string
          source_id: string
          started_at?: string | null
          status?: string
        }
        Update: {
          attempts?: number
          enrichment_status?: string
          error_message?: string | null
          finished_at?: string | null
          id?: string
          job_payload?: Json | null
          job_type?: string
          last_processed_at?: string | null
          priority?: number
          rate_limited_until?: string | null
          requested_at?: string
          requested_by?: string | null
          since?: string
          source_id?: string
          started_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "ingest_queue_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      ingest_queue_run_log: {
        Row: {
          finished_at: string | null
          id: string
          jobs_completed: number
          jobs_failed: number
          jobs_picked: number
          jobs_rate_limited: number
          notes: string | null
          started_at: string
          x_api_calls: number
        }
        Insert: {
          finished_at?: string | null
          id?: string
          jobs_completed?: number
          jobs_failed?: number
          jobs_picked?: number
          jobs_rate_limited?: number
          notes?: string | null
          started_at?: string
          x_api_calls?: number
        }
        Update: {
          finished_at?: string | null
          id?: string
          jobs_completed?: number
          jobs_failed?: number
          jobs_picked?: number
          jobs_rate_limited?: number
          notes?: string | null
          started_at?: string
          x_api_calls?: number
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
      rate_limit_access_requests: {
        Row: {
          bucket_start: string
          count: number
          ip_hash: string
          last_attempt_at: string
        }
        Insert: {
          bucket_start: string
          count?: number
          ip_hash: string
          last_attempt_at?: string
        }
        Update: {
          bucket_start?: string
          count?: number
          ip_hash?: string
          last_attempt_at?: string
        }
        Relationships: []
      }
      rate_limit_congress_suggest: {
        Row: {
          count: number
          updated_at: string
          user_id: string
          window_start: string
        }
        Insert: {
          count?: number
          updated_at?: string
          user_id: string
          window_start: string
        }
        Update: {
          count?: number
          updated_at?: string
          user_id?: string
          window_start?: string
        }
        Relationships: []
      }
      rate_limit_global_lookups: {
        Row: {
          count: number
          id: number
          updated_at: string
          window_start: string
        }
        Insert: {
          count?: number
          id?: number
          updated_at?: string
          window_start?: string
        }
        Update: {
          count?: number
          id?: number
          updated_at?: string
          window_start?: string
        }
        Relationships: []
      }
      rate_limit_lookups: {
        Row: {
          count: number
          updated_at: string
          user_id: string
          window_start: string
        }
        Insert: {
          count?: number
          updated_at?: string
          user_id: string
          window_start: string
        }
        Update: {
          count?: number
          updated_at?: string
          user_id?: string
          window_start?: string
        }
        Relationships: []
      }
      recommended_congresses_by_specialty: {
        Row: {
          congress_id: string
          created_at: string
          created_by: string | null
          id: string
          note: string | null
          specialty_id: string
          updated_at: string
          weight: number
        }
        Insert: {
          congress_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          specialty_id: string
          updated_at?: string
          weight?: number
        }
        Update: {
          congress_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          specialty_id?: string
          updated_at?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "recommended_congresses_by_specialty_specialty_id_fkey"
            columns: ["specialty_id"]
            isOneToOne: false
            referencedRelation: "urology_specialties"
            referencedColumns: ["id"]
          },
        ]
      }
      recommended_hashtags_by_specialty: {
        Row: {
          created_at: string
          created_by: string | null
          hashtag_id: string
          id: string
          note: string | null
          specialty_id: string
          updated_at: string
          weight: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          hashtag_id: string
          id?: string
          note?: string | null
          specialty_id: string
          updated_at?: string
          weight?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          hashtag_id?: string
          id?: string
          note?: string | null
          specialty_id?: string
          updated_at?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "recommended_hashtags_by_specialty_hashtag_id_fkey"
            columns: ["hashtag_id"]
            isOneToOne: false
            referencedRelation: "hashtags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recommended_hashtags_by_specialty_specialty_id_fkey"
            columns: ["specialty_id"]
            isOneToOne: false
            referencedRelation: "urology_specialties"
            referencedColumns: ["id"]
          },
        ]
      }
      recommended_sources_by_specialty: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          note: string | null
          source_id: string
          specialty_id: string
          updated_at: string
          weight: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          source_id: string
          specialty_id: string
          updated_at?: string
          weight?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          source_id?: string
          specialty_id?: string
          updated_at?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "recommended_sources_by_specialty_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recommended_sources_by_specialty_specialty_id_fkey"
            columns: ["specialty_id"]
            isOneToOne: false
            referencedRelation: "urology_specialties"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          abstract_ids: string[]
          chairs: string[]
          congress_id: string
          created_at: string
          end_time: string
          entities: string[]
          id: string
          room: string
          seeded_from_mock: boolean
          session_hashtag: string | null
          start_time: string
          title: string
          track: string
          updated_at: string
        }
        Insert: {
          abstract_ids?: string[]
          chairs?: string[]
          congress_id: string
          created_at?: string
          end_time: string
          entities?: string[]
          id: string
          room?: string
          seeded_from_mock?: boolean
          session_hashtag?: string | null
          start_time: string
          title: string
          track?: string
          updated_at?: string
        }
        Update: {
          abstract_ids?: string[]
          chairs?: string[]
          congress_id?: string
          created_at?: string
          end_time?: string
          entities?: string[]
          id?: string
          room?: string
          seeded_from_mock?: boolean
          session_hashtag?: string | null
          start_time?: string
          title?: string
          track?: string
          updated_at?: string
        }
        Relationships: []
      }
      source_candidate_dismissals: {
        Row: {
          created_at: string
          handle: string
          user_id: string
        }
        Insert: {
          created_at?: string
          handle: string
          user_id: string
        }
        Update: {
          created_at?: string
          handle?: string
          user_id?: string
        }
        Relationships: []
      }
      source_candidates: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          display_name: string | null
          enrichment_attempted_at: string | null
          enrichment_error: string | null
          enrichment_status: string
          external_user_id: string | null
          first_seen_at: string
          followers_count: number | null
          handle: string
          last_seen_at: string | null
          mention_count: number
          quote_count: number
          reply_count: number
          signal_breakdown: Json
          total_signal: number
          updated_at: string
          verified: boolean
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          enrichment_attempted_at?: string | null
          enrichment_error?: string | null
          enrichment_status?: string
          external_user_id?: string | null
          first_seen_at?: string
          followers_count?: number | null
          handle: string
          last_seen_at?: string | null
          mention_count?: number
          quote_count?: number
          reply_count?: number
          signal_breakdown?: Json
          total_signal?: number
          updated_at?: string
          verified?: boolean
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          enrichment_attempted_at?: string | null
          enrichment_error?: string | null
          enrichment_status?: string
          external_user_id?: string | null
          first_seen_at?: string
          followers_count?: number | null
          handle?: string
          last_seen_at?: string | null
          mention_count?: number
          quote_count?: number
          reply_count?: number
          signal_breakdown?: Json
          total_signal?: number
          updated_at?: string
          verified?: boolean
        }
        Relationships: []
      }
      source_group_cancer_areas: {
        Row: {
          cancer_area_id: string
          group_id: string
        }
        Insert: {
          cancer_area_id: string
          group_id: string
        }
        Update: {
          cancer_area_id?: string
          group_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "source_group_cancer_areas_cancer_area_id_fkey"
            columns: ["cancer_area_id"]
            isOneToOne: false
            referencedRelation: "cancer_areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "source_group_cancer_areas_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "source_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      source_group_member_candidates: {
        Row: {
          evidence: Json
          group_id: string
          id: string
          nominated_at: string
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          score: number
          source_id: string
          status: string
        }
        Insert: {
          evidence?: Json
          group_id: string
          id?: string
          nominated_at?: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          score?: number
          source_id: string
          status?: string
        }
        Update: {
          evidence?: Json
          group_id?: string
          id?: string
          nominated_at?: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          score?: number
          source_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "source_group_member_candidates_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "source_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "source_group_member_candidates_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      source_group_members: {
        Row: {
          added_at: string
          added_by: string | null
          added_evidence: Json | null
          added_via: string
          group_id: string
          source_id: string
        }
        Insert: {
          added_at?: string
          added_by?: string | null
          added_evidence?: Json | null
          added_via?: string
          group_id: string
          source_id: string
        }
        Update: {
          added_at?: string
          added_by?: string | null
          added_evidence?: Json | null
          added_via?: string
          group_id?: string
          source_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "source_group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "source_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "source_group_members_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      source_groups: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_archived: boolean
          is_system: boolean
          member_count: number
          name: string
          slug: string
          subscriber_count: number
          updated_at: string
          visibility: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_archived?: boolean
          is_system?: boolean
          member_count?: number
          name: string
          slug: string
          subscriber_count?: number
          updated_at?: string
          visibility: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_archived?: boolean
          is_system?: boolean
          member_count?: number
          name?: string
          slug?: string
          subscriber_count?: number
          updated_at?: string
          visibility?: string
        }
        Relationships: []
      }
      source_lists: {
        Row: {
          color: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
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
      summaries: {
        Row: {
          bullet_points: string[]
          controversies: string[]
          created_at: string
          generated_at: string
          id: string
          key_quotes: Json
          model_used: string
          seeded_from_mock: boolean
          sentiment: string
          takeaways: string[]
          target_id: string
          target_type: string
          tweet_count: number
          updated_at: string
        }
        Insert: {
          bullet_points?: string[]
          controversies?: string[]
          created_at?: string
          generated_at?: string
          id: string
          key_quotes?: Json
          model_used?: string
          seeded_from_mock?: boolean
          sentiment?: string
          takeaways?: string[]
          target_id: string
          target_type: string
          tweet_count?: number
          updated_at?: string
        }
        Update: {
          bullet_points?: string[]
          controversies?: string[]
          created_at?: string
          generated_at?: string
          id?: string
          key_quotes?: Json
          model_used?: string
          seeded_from_mock?: boolean
          sentiment?: string
          takeaways?: string[]
          target_id?: string
          target_type?: string
          tweet_count?: number
          updated_at?: string
        }
        Relationships: []
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      tweet_match_run_log: {
        Row: {
          finished_at: string | null
          hashtag_matches: number
          id: string
          llm_calls: number
          llm_matches: number
          llm_tokens_used: number
          notes: string | null
          started_at: string
          time_window_matches: number
          tweets_considered: number
        }
        Insert: {
          finished_at?: string | null
          hashtag_matches?: number
          id?: string
          llm_calls?: number
          llm_matches?: number
          llm_tokens_used?: number
          notes?: string | null
          started_at?: string
          time_window_matches?: number
          tweets_considered?: number
        }
        Update: {
          finished_at?: string | null
          hashtag_matches?: number
          id?: string
          llm_calls?: number
          llm_matches?: number
          llm_tokens_used?: number
          notes?: string | null
          started_at?: string
          time_window_matches?: number
          tweets_considered?: number
        }
        Relationships: []
      }
      tweets: {
        Row: {
          abstract_id: string | null
          author_display_name: string | null
          author_handle: string
          classification_attempted_at: string | null
          congress_id: string | null
          created_at: string
          hashtags: string[]
          id: string
          ingested_at: string
          lang: string | null
          like_count: number
          match_method: string | null
          media_urls: string[]
          parent_handle: string | null
          parent_in_db_id: string | null
          parent_text: string | null
          parent_tweet_external_id: string | null
          raw: Json | null
          reply_count: number
          retweet_count: number
          session_id: string | null
          source_id: string | null
          text: string
          tweet_type: string
        }
        Insert: {
          abstract_id?: string | null
          author_display_name?: string | null
          author_handle: string
          classification_attempted_at?: string | null
          congress_id?: string | null
          created_at: string
          hashtags?: string[]
          id: string
          ingested_at?: string
          lang?: string | null
          like_count?: number
          match_method?: string | null
          media_urls?: string[]
          parent_handle?: string | null
          parent_in_db_id?: string | null
          parent_text?: string | null
          parent_tweet_external_id?: string | null
          raw?: Json | null
          reply_count?: number
          retweet_count?: number
          session_id?: string | null
          source_id?: string | null
          text: string
          tweet_type?: string
        }
        Update: {
          abstract_id?: string | null
          author_display_name?: string | null
          author_handle?: string
          classification_attempted_at?: string | null
          congress_id?: string | null
          created_at?: string
          hashtags?: string[]
          id?: string
          ingested_at?: string
          lang?: string | null
          like_count?: number
          match_method?: string | null
          media_urls?: string[]
          parent_handle?: string | null
          parent_in_db_id?: string | null
          parent_text?: string | null
          parent_tweet_external_id?: string | null
          raw?: Json | null
          reply_count?: number
          retweet_count?: number
          session_id?: string | null
          source_id?: string | null
          text?: string
          tweet_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "tweets_parent_in_db_id_fkey"
            columns: ["parent_in_db_id"]
            isOneToOne: false
            referencedRelation: "tweets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tweets_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      urology_specialties: {
        Row: {
          created_at: string
          description: string
          id: string
          label: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          description: string
          id: string
          label: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          label?: string
          sort_order?: number
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
      user_cancer_areas: {
        Row: {
          cancer_area_id: string
          created_at: string
          is_primary: boolean
          user_id: string
        }
        Insert: {
          cancer_area_id: string
          created_at?: string
          is_primary?: boolean
          user_id: string
        }
        Update: {
          cancer_area_id?: string
          created_at?: string
          is_primary?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_cancer_areas_cancer_area_id_fkey"
            columns: ["cancer_area_id"]
            isOneToOne: false
            referencedRelation: "cancer_areas"
            referencedColumns: ["id"]
          },
        ]
      }
      user_invitations: {
        Row: {
          accepted_at: string | null
          accepted_user_id: string | null
          created_at: string
          display_name: string | null
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          role: string
          status: string
          token: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_user_id?: string | null
          created_at?: string
          display_name?: string | null
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          role: string
          status?: string
          token: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_user_id?: string | null
          created_at?: string
          display_name?: string | null
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          role?: string
          status?: string
          token?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_onboarding_state: {
        Row: {
          completed_at: string | null
          created_at: string
          current_step: number
          skipped_at: string | null
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          current_step?: number
          skipped_at?: string | null
          updated_at?: string
          user_id: string
          version?: number
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          current_step?: number
          skipped_at?: string | null
          updated_at?: string
          user_id?: string
          version?: number
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
      user_profile_extras: {
        Row: {
          created_at: string
          deactivated_at: string | null
          deactivated_by: string | null
          display_name: string | null
          is_active: boolean
          notes: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deactivated_at?: string | null
          deactivated_by?: string | null
          display_name?: string | null
          is_active?: boolean
          notes?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          deactivated_at?: string | null
          deactivated_by?: string | null
          display_name?: string | null
          is_active?: boolean
          notes?: string | null
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
      user_specialties: {
        Row: {
          created_at: string
          is_primary: boolean
          specialty_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          is_primary?: boolean
          specialty_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          is_primary?: boolean
          specialty_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_specialties_specialty_id_fkey"
            columns: ["specialty_id"]
            isOneToOne: false
            referencedRelation: "urology_specialties"
            referencedColumns: ["id"]
          },
        ]
      }
      user_subscribed_congresses: {
        Row: {
          congress_id: string
          created_at: string
          user_id: string
        }
        Insert: {
          congress_id: string
          created_at?: string
          user_id: string
        }
        Update: {
          congress_id?: string
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_subscribed_groups: {
        Row: {
          group_id: string
          subscribed_at: string
          user_id: string
        }
        Insert: {
          group_id: string
          subscribed_at?: string
          user_id: string
        }
        Update: {
          group_id?: string
          subscribed_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_subscribed_groups_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "source_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      user_subscribed_hashtags: {
        Row: {
          created_at: string
          hashtag_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          hashtag_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          hashtag_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_subscribed_hashtags_hashtag_id_fkey"
            columns: ["hashtag_id"]
            isOneToOne: false
            referencedRelation: "hashtags"
            referencedColumns: ["id"]
          },
        ]
      }
      user_subscribed_sources: {
        Row: {
          created_at: string
          source_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          source_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          source_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_subscribed_sources_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      user_x_credentials: {
        Row: {
          access_token: string | null
          access_token_secret_encrypted: string | null
          auth_mode: string
          consumer_key: string | null
          consumer_secret_encrypted: string | null
          created_at: string
          id: string
          is_active: boolean
          last_post_at: string | null
          last_verified_at: string | null
          post_count_today: number
          post_count_window_start: string | null
          revoked_at: string | null
          scope_write: boolean
          updated_at: string
          user_id: string
          x_user_id: string | null
          x_username: string | null
        }
        Insert: {
          access_token?: string | null
          access_token_secret_encrypted?: string | null
          auth_mode?: string
          consumer_key?: string | null
          consumer_secret_encrypted?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          last_post_at?: string | null
          last_verified_at?: string | null
          post_count_today?: number
          post_count_window_start?: string | null
          revoked_at?: string | null
          scope_write?: boolean
          updated_at?: string
          user_id: string
          x_user_id?: string | null
          x_username?: string | null
        }
        Update: {
          access_token?: string | null
          access_token_secret_encrypted?: string | null
          auth_mode?: string
          consumer_key?: string | null
          consumer_secret_encrypted?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          last_post_at?: string | null
          last_verified_at?: string | null
          post_count_today?: number
          post_count_window_start?: string | null
          revoked_at?: string | null
          scope_write?: boolean
          updated_at?: string
          user_id?: string
          x_user_id?: string | null
          x_username?: string | null
        }
        Relationships: []
      }
      user_x_post_log: {
        Row: {
          error_code: string | null
          error_message: string | null
          id: string
          in_reply_to_tweet_id: string | null
          posted_at: string
          posted_tweet_id: string | null
          quoted_tweet_id: string | null
          status: string
          text: string
          user_id: string
        }
        Insert: {
          error_code?: string | null
          error_message?: string | null
          id?: string
          in_reply_to_tweet_id?: string | null
          posted_at?: string
          posted_tweet_id?: string | null
          quoted_tweet_id?: string | null
          status: string
          text: string
          user_id: string
        }
        Update: {
          error_code?: string | null
          error_message?: string | null
          id?: string
          in_reply_to_tweet_id?: string | null
          posted_at?: string
          posted_tweet_id?: string | null
          quoted_tweet_id?: string | null
          status?: string
          text?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      user_effective_sources: {
        Row: {
          group_id: string | null
          source_id: string | null
          user_id: string | null
          via: string | null
        }
        Relationships: []
      }
      user_x_connection_status: {
        Row: {
          auth_mode: string | null
          created_at: string | null
          last_post_at: string | null
          last_verified_at: string | null
          post_count_today: number | null
          post_count_window_start: string | null
          revoked_at: string | null
          scope_write: boolean | null
          updated_at: string | null
          user_id: string | null
          x_user_id: string | null
          x_username: string | null
        }
        Insert: {
          auth_mode?: string | null
          created_at?: string | null
          last_post_at?: string | null
          last_verified_at?: string | null
          post_count_today?: number | null
          post_count_window_start?: string | null
          revoked_at?: string | null
          scope_write?: boolean | null
          updated_at?: string | null
          user_id?: string | null
          x_user_id?: string | null
          x_username?: string | null
        }
        Update: {
          auth_mode?: string | null
          created_at?: string | null
          last_post_at?: string | null
          last_verified_at?: string | null
          post_count_today?: number | null
          post_count_window_start?: string | null
          revoked_at?: string | null
          scope_write?: boolean | null
          updated_at?: string | null
          user_id?: string | null
          x_user_id?: string | null
          x_username?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      get_active_user_count: { Args: never; Returns: number }
      get_cron_job_secret: { Args: never; Returns: string }
      get_ingestion_cron_health: {
        Args: never
        Returns: {
          age_seconds: number
          expected_interval_seconds: number
          is_stale: boolean
          jobname: string
          last_success_at: string
          schedule: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      release_ingest_queue_lock: { Args: never; Returns: boolean }
      release_tweet_matcher_lock: { Args: never; Returns: boolean }
      sync_cron_job_secret: { Args: { _secret: string }; Returns: boolean }
      try_ingest_queue_lock: { Args: never; Returns: boolean }
      try_tweet_matcher_lock: { Args: never; Returns: boolean }
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
