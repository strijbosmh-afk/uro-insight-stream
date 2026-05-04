import * as React from "react";
import { render } from "@react-email/components";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { TEMPLATES } from "@/lib/email-templates/registry";
import { buildDigestPayload, computeNextSendAt } from "@/server/digest.server";

// Mirrors the constants baked into the transactional send route.
const SITE_NAME = "uro-insight-stream";
const SENDER_DOMAIN = "notify.urofeed.com";
const FROM_DOMAIN = "urofeed.com";

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Send (enqueue) a digest email to all recipients of one digest_subscription.
 * Updates last_sent_at and rolls next_send_at forward on success.
 */
export async function sendDigestById(digestId: string): Promise<{
  ok: boolean;
  enqueued: number;
  skipped: number;
  reason?: string;
}> {
  const payload = await buildDigestPayload(digestId);
  if (!payload) return { ok: false, enqueued: 0, skipped: 0, reason: "no_recipients_or_sources" };

  const template = TEMPLATES["weekly-digest"];
  if (!template) {
    return { ok: false, enqueued: 0, skipped: 0, reason: "template_missing" };
  }

  const templateData = {
    digestName: payload.digestName,
    windowStart: payload.windowStart,
    windowEnd: payload.windowEnd,
    totalTweets: payload.totalTweets,
    groups: payload.groups,
  } as Record<string, unknown>;

  const element = React.createElement(template.component, templateData);
  const html = await render(element);
  const plainText = await render(element, { plainText: true });
  const subject =
    typeof template.subject === "function"
      ? template.subject(templateData)
      : template.subject;

  // Fetch the full digest row for scheduling update afterwards.
  const { data: digest } = await supabaseAdmin
    .from("digest_subscriptions")
    .select("frequency, day_of_week, send_hour")
    .eq("id", digestId)
    .maybeSingle();

  let enqueued = 0;
  let skipped = 0;

  for (const recipient of payload.recipients) {
    const normalized = recipient.toLowerCase();

    // Suppression check
    const { data: suppressed } = await supabaseAdmin
      .from("suppressed_emails")
      .select("id")
      .eq("email", normalized)
      .maybeSingle();
    if (suppressed) {
      skipped += 1;
      continue;
    }

    // One unsubscribe token per email address
    let unsubscribeToken: string;
    const { data: existing } = await supabaseAdmin
      .from("email_unsubscribe_tokens")
      .select("token, used_at")
      .eq("email", normalized)
      .maybeSingle();

    if (existing && !existing.used_at) {
      unsubscribeToken = existing.token;
    } else if (!existing) {
      unsubscribeToken = generateToken();
      await supabaseAdmin
        .from("email_unsubscribe_tokens")
        .upsert(
          { token: unsubscribeToken, email: normalized },
          { onConflict: "email", ignoreDuplicates: true },
        );
      const { data: stored } = await supabaseAdmin
        .from("email_unsubscribe_tokens")
        .select("token")
        .eq("email", normalized)
        .maybeSingle();
      if (stored?.token) unsubscribeToken = stored.token;
    } else {
      // Token used → treat as suppressed
      skipped += 1;
      continue;
    }

    const messageId = crypto.randomUUID();
    const idempotencyKey = `digest-${digestId}-${normalized}-${payload.windowEnd}`;

    await supabaseAdmin.from("email_send_log").insert({
      message_id: messageId,
      template_name: "weekly-digest",
      recipient_email: recipient,
      status: "pending",
    });

    const { error: enqueueError } = await supabaseAdmin.rpc("enqueue_email", {
      queue_name: "transactional_emails",
      payload: {
        message_id: messageId,
        to: recipient,
        from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
        sender_domain: SENDER_DOMAIN,
        subject,
        html,
        text: plainText,
        purpose: "transactional",
        label: "weekly-digest",
        idempotency_key: idempotencyKey,
        unsubscribe_token: unsubscribeToken,
        queued_at: new Date().toISOString(),
      },
    });

    if (enqueueError) {
      await supabaseAdmin.from("email_send_log").insert({
        message_id: messageId,
        template_name: "weekly-digest",
        recipient_email: recipient,
        status: "failed",
        error_message: enqueueError.message,
      });
      continue;
    }
    enqueued += 1;
  }

  // Roll the schedule forward when we successfully queued at least one email.
  if (enqueued > 0 && digest) {
    const next = computeNextSendAt({
      frequency: digest.frequency,
      dayOfWeek: digest.day_of_week ?? null,
      sendHour: digest.send_hour,
    });
    await supabaseAdmin
      .from("digest_subscriptions")
      .update({
        last_sent_at: new Date().toISOString(),
        next_send_at: next.toISOString(),
      })
      .eq("id", digestId);
  }

  return { ok: true, enqueued, skipped };
}
