import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertAdmin } from "@/server/admin-middleware.server";

export type EmailLogStatus =
  | "pending"
  | "sent"
  | "failed"
  | "dlq"
  | "suppressed"
  | "bounced"
  | "complained";

export type EmailLogRow = {
  message_id: string | null;
  template_name: string;
  recipient_email: string;
  status: string;
  error_message: string | null;
  created_at: string;
};

export type EmailDiagnosticsSummary = {
  total: number;
  sent: number;
  failed: number;
  suppressed: number;
  pending: number;
};

export type EmailDiagnosticsList = {
  rows: EmailLogRow[];
  summary: EmailDiagnosticsSummary;
  templates: string[];
  truncated: boolean;
};

export type RecipientDetail = {
  email: string;
  history: EmailLogRow[];
  suppression: {
    suppressed: boolean;
    reason: string | null;
    created_at: string | null;
  };
  unsubscribe: {
    has_token: boolean;
    used_at: string | null;
    created_at: string | null;
  };
};

const ListInput = z.object({
  search: z.string().optional(),
  template: z.string().optional(),
  status: z.string().optional(),
  rangeHours: z.number().int().positive().max(24 * 90).default(24 * 7),
  limit: z.number().int().positive().max(500).default(200),
});

export const listEmailDiagnostics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => ListInput.parse(data))
  .handler(async ({ context, data }): Promise<EmailDiagnosticsList> => {
    await assertAdmin(context.supabase, context.userId);

    const since = new Date(Date.now() - data.rangeHours * 3600 * 1000).toISOString();

    // Pull a generous slice and dedupe in memory by message_id (latest per id).
    let q = supabaseAdmin
      .from("email_send_log")
      .select("message_id, template_name, recipient_email, status, error_message, created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(2000);

    if (data.template) q = q.eq("template_name", data.template);
    if (data.search) q = q.ilike("recipient_email", `%${data.search}%`);

    const { data: rawRows, error } = await q;
    if (error) throw new Error(error.message);

    const seen = new Set<string>();
    const deduped: EmailLogRow[] = [];
    for (const r of rawRows ?? []) {
      const key = r.message_id ?? `${r.recipient_email}:${r.created_at}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(r as EmailLogRow);
    }

    const filtered = data.status
      ? deduped.filter((r) => r.status === data.status)
      : deduped;

    const summary: EmailDiagnosticsSummary = {
      total: deduped.length,
      sent: deduped.filter((r) => r.status === "sent").length,
      failed: deduped.filter((r) => r.status === "failed" || r.status === "dlq" || r.status === "bounced").length,
      suppressed: deduped.filter((r) => r.status === "suppressed").length,
      pending: deduped.filter((r) => r.status === "pending").length,
    };

    const { data: tmplRows } = await supabaseAdmin
      .from("email_send_log")
      .select("template_name")
      .order("template_name");
    const templates = Array.from(
      new Set((tmplRows ?? []).map((r) => r.template_name).filter(Boolean) as string[]),
    ).sort();

    return {
      rows: filtered.slice(0, data.limit),
      summary,
      templates,
      truncated: filtered.length > data.limit,
    };
  });

const RecipientInput = z.object({
  email: z.string().email(),
});

export const getRecipientDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => RecipientInput.parse(data))
  .handler(async ({ context, data }): Promise<RecipientDetail> => {
    await assertAdmin(context.supabase, context.userId);

    const normalized = data.email.toLowerCase();

    const [{ data: history, error: histErr }, { data: supp }, { data: token }] =
      await Promise.all([
        supabaseAdmin
          .from("email_send_log")
          .select("message_id, template_name, recipient_email, status, error_message, created_at")
          .ilike("recipient_email", normalized)
          .order("created_at", { ascending: false })
          .limit(200),
        supabaseAdmin
          .from("suppressed_emails")
          .select("reason, created_at")
          .eq("email", normalized)
          .maybeSingle(),
        supabaseAdmin
          .from("email_unsubscribe_tokens")
          .select("created_at, used_at")
          .eq("email", normalized)
          .maybeSingle(),
      ]);

    if (histErr) throw new Error(histErr.message);

    return {
      email: data.email,
      history: (history ?? []) as EmailLogRow[],
      suppression: {
        suppressed: Boolean(supp),
        reason: supp?.reason ?? null,
        created_at: supp?.created_at ?? null,
      },
      unsubscribe: {
        has_token: Boolean(token),
        used_at: token?.used_at ?? null,
        created_at: token?.created_at ?? null,
      },
    };
  });