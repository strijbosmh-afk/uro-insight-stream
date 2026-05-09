import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { computeNextSendAt } from "@/server/digest.server";

const FrequencyEnum = z.enum(["daily", "weekly", "biweekly", "monthly"]);

const BaseSchema = z.object({
  name: z.string().min(1).max(120),
  frequency: FrequencyEnum,
  day_of_week: z.number().int().min(0).max(6).nullable().optional(),
  send_hour: z.number().int().min(0).max(23),
  timezone: z.string().min(1).max(64).default("UTC"),
  is_active: z.boolean().optional(),
  source_ids: z.array(z.string().min(1).max(80)).max(200).default([]),
  specialty_id: z.string().min(1).max(80).nullable().optional(),
  congress_id: z.string().min(1).max(80).nullable().optional(),
  hashtags: z.array(z.string().min(1).max(80)).max(50).default([]),
  recipients: z
    .array(
      z.object({
        email: z.string().email().max(254),
        is_default: z.boolean().optional(),
      }),
    )
    .min(1)
    .max(20),
});

const hasBinding = (d: z.infer<typeof BaseSchema>) =>
  (d.source_ids && d.source_ids.length > 0) ||
  !!d.specialty_id ||
  !!d.congress_id ||
  (d.hashtags && d.hashtags.length > 0);

const CreateSchema = BaseSchema.refine(hasBinding, {
  message: "At least one binding is required (sources, specialty, congress, or hashtags)",
});

const UpdateSchema = BaseSchema.extend({ id: z.string().uuid() }).refine(
  hasBinding,
  { message: "At least one binding is required (sources, specialty, congress, or hashtags)" },
);

const IdSchema = z.object({ id: z.string().uuid() });
const ToggleSchema = z.object({ id: z.string().uuid(), is_active: z.boolean() });

export const listUserDigests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { data: digests, error } = await supabaseAdmin
      .from("digest_subscriptions")
      .select(
        "id, name, frequency, day_of_week, send_hour, timezone, is_active, last_sent_at, next_send_at, created_at, specialty_id, congress_id, hashtags",
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const ids = (digests ?? []).map((d: { id: string }) => d.id);
    const counts: Record<string, { sources: number; recipients: number }> = {};
    if (ids.length > 0) {
      const [{ data: srcs }, { data: recs }] = await Promise.all([
        supabaseAdmin
          .from("digest_subscription_sources")
          .select("digest_id")
          .in("digest_id", ids),
        supabaseAdmin
          .from("digest_subscription_recipients")
          .select("digest_id")
          .in("digest_id", ids),
      ]);
      for (const r of (srcs ?? []) as Array<{ digest_id: string }>) {
        counts[r.digest_id] = counts[r.digest_id] ?? { sources: 0, recipients: 0 };
        counts[r.digest_id].sources += 1;
      }
      for (const r of (recs ?? []) as Array<{ digest_id: string }>) {
        counts[r.digest_id] = counts[r.digest_id] ?? { sources: 0, recipients: 0 };
        counts[r.digest_id].recipients += 1;
      }
    }

    return (digests ?? []).map((d: any) => ({
      ...d,
      source_count: counts[d.id]?.sources ?? 0,
      recipient_count: counts[d.id]?.recipients ?? 0,
    }));
  });

export const getDigest = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => IdSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: digest, error } = await supabaseAdmin
      .from("digest_subscriptions")
      .select("*")
      .eq("id", data.id)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!digest) throw new Error("Digest not found");

    const [{ data: srcs }, { data: recs }] = await Promise.all([
      supabaseAdmin
        .from("digest_subscription_sources")
        .select("source_id")
        .eq("digest_id", data.id),
      supabaseAdmin
        .from("digest_subscription_recipients")
        .select("email, is_default")
        .eq("digest_id", data.id),
    ]);

    return {
      ...digest,
      source_ids: (srcs ?? []).map((r: { source_id: string }) => r.source_id),
      recipients: (recs ?? []) as Array<{ email: string; is_default: boolean }>,
    };
  });

export const createDigest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => CreateSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const nextSend = computeNextSendAt({
      frequency: data.frequency,
      dayOfWeek: data.day_of_week ?? null,
      sendHour: data.send_hour,
    });

    const { data: inserted, error } = await supabaseAdmin
      .from("digest_subscriptions")
      .insert({
        user_id: userId,
        name: data.name,
        frequency: data.frequency,
        day_of_week: data.day_of_week ?? null,
        send_hour: data.send_hour,
        timezone: data.timezone,
        is_active: data.is_active ?? true,
        next_send_at: nextSend.toISOString(),
        specialty_id: data.specialty_id ?? null,
        congress_id: data.congress_id ?? null,
        hashtags: data.hashtags ?? [],
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const digestId = inserted.id as string;
    const srcRows = data.source_ids.map((source_id) => ({ digest_id: digestId, source_id }));
    const recRows = data.recipients.map((r, idx) => ({
      digest_id: digestId,
      email: r.email.toLowerCase(),
      is_default: r.is_default ?? idx === 0,
    }));
    const [{ error: srcErr }, { error: recErr }] = await Promise.all([
      supabaseAdmin.from("digest_subscription_sources").insert(srcRows),
      supabaseAdmin.from("digest_subscription_recipients").insert(recRows),
    ]);
    if (srcErr) throw new Error(srcErr.message);
    if (recErr) throw new Error(recErr.message);

    return { id: digestId };
  });

export const updateDigest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => UpdateSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const nextSend = computeNextSendAt({
      frequency: data.frequency,
      dayOfWeek: data.day_of_week ?? null,
      sendHour: data.send_hour,
    });
    const { error } = await supabaseAdmin
      .from("digest_subscriptions")
      .update({
        name: data.name,
        frequency: data.frequency,
        day_of_week: data.day_of_week ?? null,
        send_hour: data.send_hour,
        timezone: data.timezone,
        is_active: data.is_active ?? true,
        next_send_at: nextSend.toISOString(),
        specialty_id: data.specialty_id ?? null,
        congress_id: data.congress_id ?? null,
        hashtags: data.hashtags ?? [],
      })
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);

    // Replace sources + recipients
    await supabaseAdmin.from("digest_subscription_sources").delete().eq("digest_id", data.id);
    await supabaseAdmin
      .from("digest_subscription_recipients")
      .delete()
      .eq("digest_id", data.id);
    const srcRows = data.source_ids.map((source_id) => ({ digest_id: data.id, source_id }));
    const recRows = data.recipients.map((r, idx) => ({
      digest_id: data.id,
      email: r.email.toLowerCase(),
      is_default: r.is_default ?? idx === 0,
    }));
    const [{ error: srcErr }, { error: recErr }] = await Promise.all([
      supabaseAdmin.from("digest_subscription_sources").insert(srcRows),
      supabaseAdmin.from("digest_subscription_recipients").insert(recRows),
    ]);
    if (srcErr) throw new Error(srcErr.message);
    if (recErr) throw new Error(recErr.message);

    return { id: data.id };
  });

export const toggleDigest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => ToggleSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { error } = await supabaseAdmin
      .from("digest_subscriptions")
      .update({ is_active: data.is_active })
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteDigest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => IdSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { error } = await supabaseAdmin
      .from("digest_subscriptions")
      .delete()
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const sendDigestNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => IdSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    // Confirm ownership before triggering server-side send
    const { data: owned } = await supabaseAdmin
      .from("digest_subscriptions")
      .select("id")
      .eq("id", data.id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!owned) throw new Error("Digest not found");

    const { sendDigestById } = await import("@/server/digest-sender.server");
    const result = await sendDigestById(data.id);
    return result;
  });
