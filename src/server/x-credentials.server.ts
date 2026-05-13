// Server-only: per-user X (Twitter) credential storage and verification.
// Uses AES-256-GCM via Node's crypto (Worker-compatible with nodejs_compat).
// Plaintext secrets must NEVER leave this module.

import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";
import OAuth from "oauth-1.0a";
import { createHmac } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// ---------------------------------------------------------------------------
// Key registry — supports rotation.
// Each row in user_x_credentials carries a `key_id` (defaults to 1) telling
// us which key was used to encrypt its blobs. To rotate:
//   1. Add a new env var X_CREDENTIALS_KEY_<N> alongside the existing
//      X_CREDENTIALS_KEY (treated as id=1 for back-compat).
//   2. Bump ACTIVE_KEY_ID below to <N>. New writes start using it.
//   3. Old rows continue to decrypt with their stored key_id; re-encrypt them
//      lazily (e.g. next verifyAndStore) or via a one-off backfill that calls
//      decryptSecret + encryptSecret and updates key_id=ACTIVE_KEY_ID.
//   4. Once no row references the old key_id, drop the old env var.
// X_CREDENTIALS_KEY is NOT pgsodium — it's app-level AES-256-GCM. Losing the
// key means losing every user's OAuth1 secrets (treat as a recoverable
// re-onboarding, not a silent data loss).
const ACTIVE_KEY_ID = 1;

function deriveKey(raw: string): Buffer {
  const buf = Buffer.from(raw, "base64");
  if (buf.length === 32) return buf;
  if (raw.length === 32) return Buffer.from(raw, "utf8");
  return Buffer.from(createHash("sha256").update(raw).digest());
}

function getKeyById(keyId: number): Buffer {
  const envName = keyId === 1 ? "X_CREDENTIALS_KEY" : `X_CREDENTIALS_KEY_${keyId}`;
  const raw = process.env[envName];
  if (!raw) throw new Error(`${envName} env var not configured (key_id=${keyId})`);
  return deriveKey(raw);
}

export function encryptSecret(plaintext: string, keyId: number = ACTIVE_KEY_ID): Buffer {
  const key = getKeyById(keyId);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Layout: [12-byte IV][16-byte tag][ciphertext]
  return Buffer.concat([iv, tag, ct]);
}

export function decryptSecret(blob: Buffer, keyId: number = ACTIVE_KEY_ID): string {
  const key = getKeyById(keyId);
  const iv = blob.subarray(0, 12);
  const tag = blob.subarray(12, 28);
  const ct = blob.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

export function getActiveKeyId(): number {
  return ACTIVE_KEY_ID;
}

export interface XCredentials {
  consumerKey: string;
  consumerSecret: string;
  accessToken: string;
  accessTokenSecret: string;
  xUsername: string | null;
  xUserId: string | null;
}

function makeOAuth(consumerKey: string, consumerSecret: string) {
  return new OAuth({
    consumer: { key: consumerKey, secret: consumerSecret },
    signature_method: "HMAC-SHA1",
    hash_function(base, key) {
      return createHmac("sha1", key).update(base).digest("base64");
    },
  });
}

export async function loadCredentials(userId: string): Promise<XCredentials | null> {
  const { data, error } = await supabaseAdmin
    .from("user_x_credentials")
    .select(
      "consumer_key, consumer_secret_encrypted, access_token, access_token_secret_encrypted, x_username, x_user_id, revoked_at, key_id"
    )
    .eq("user_id", userId)
    .eq("is_active", true)
    .is("revoked_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.revoked_at) return null;
  if (!data.consumer_key || !data.access_token || !data.consumer_secret_encrypted || !data.access_token_secret_encrypted) {
    return null;
  }
  // bytea comes back as hex string "\\x..." or as Uint8Array depending on path; normalize.
  const toBuf = (v: unknown): Buffer => {
    if (Buffer.isBuffer(v)) return v;
    if (v instanceof Uint8Array) return Buffer.from(v);
    if (typeof v === "string") {
      if (v.startsWith("\\x")) return Buffer.from(v.slice(2), "hex");
      return Buffer.from(v, "base64");
    }
    throw new Error("Unexpected encrypted blob type");
  };
  return {
    consumerKey: data.consumer_key,
    consumerSecret: decryptSecret(toBuf(data.consumer_secret_encrypted), data.key_id ?? 1),
    accessToken: data.access_token,
    accessTokenSecret: decryptSecret(toBuf(data.access_token_secret_encrypted), data.key_id ?? 1),
    xUsername: data.x_username,
    xUserId: data.x_user_id,
  };
}

export interface VerifyInput {
  userId: string;
  consumerKey: string;
  consumerSecret: string;
  accessToken: string;
  accessTokenSecret: string;
}

export type VerifyError =
  | { ok: false; code: "invalid_credentials"; message: string }
  | { ok: false; code: "network_error"; message: string };

export type VerifyResult =
  | { ok: true; xUserId: string; xUsername: string }
  | VerifyError;

export async function verifyAndStore(input: VerifyInput): Promise<VerifyResult> {
  const oauth = makeOAuth(input.consumerKey, input.consumerSecret);
  const url = "https://api.twitter.com/2/users/me";
  const requestData = { url, method: "GET" as const };
  const headers = oauth.toHeader(
    oauth.authorize(requestData, {
      key: input.accessToken,
      secret: input.accessTokenSecret,
    })
  );

  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: { ...(headers as unknown as Record<string, string>) },
    });
  } catch (e) {
    return { ok: false, code: "network_error", message: (e as Error).message };
  }

  if (res.status === 401 || res.status === 403) {
    return {
      ok: false,
      code: "invalid_credentials",
      message: "X rejected these credentials. Double-check all four values and that your app has Read+Write permissions.",
    };
  }
  if (!res.ok) {
    return {
      ok: false,
      code: "network_error",
      message: `X API returned ${res.status}: ${await res.text()}`,
    };
  }
  const json = (await res.json()) as { data?: { id: string; username: string } };
  if (!json.data?.id) {
    return { ok: false, code: "invalid_credentials", message: "X did not return a user." };
  }

  // PostgREST serializes bytea as hex literals: '\xDEADBEEF'
  const toHex = (buf: Buffer) => "\\x" + buf.toString("hex");
  const consumerSecretEnc = toHex(encryptSecret(input.consumerSecret));
  const accessSecretEnc = toHex(encryptSecret(input.accessTokenSecret));

  // Make this account active; deactivate any others for this user first to
  // avoid the unique partial index conflict.
  const { error: deactErr } = await supabaseAdmin
    .from("user_x_credentials")
    .update({ is_active: false })
    .eq("user_id", input.userId);
  if (deactErr) {
    return { ok: false, code: "network_error", message: deactErr.message };
  }

  const { error } = await supabaseAdmin
    .from("user_x_credentials")
    .upsert(
      [{
        user_id: input.userId,
        auth_mode: "oauth1_byok",
        consumer_key: input.consumerKey,
        consumer_secret_encrypted: consumerSecretEnc,
        access_token: input.accessToken,
        access_token_secret_encrypted: accessSecretEnc,
        key_id: ACTIVE_KEY_ID,
        x_user_id: json.data.id,
        x_username: json.data.username,
        scope_write: true,
        last_verified_at: new Date().toISOString(),
        revoked_at: null,
        is_active: true,
      }],
      { onConflict: "user_id,x_user_id" }
    );
  if (error) {
    return { ok: false, code: "network_error", message: error.message };
  }

  return { ok: true, xUserId: json.data.id, xUsername: json.data.username };
}

export async function revoke(userId: string, accountId?: string): Promise<void> {
  // Best-effort remote revoke (we ignore failures).
  try {
    const creds = accountId
      ? await loadCredentialsByAccountId(userId, accountId)
      : await loadCredentials(userId);
    if (creds) {
      const oauth = makeOAuth(creds.consumerKey, creds.consumerSecret);
      const url = "https://api.twitter.com/1.1/oauth/invalidate_token.json";
      const headers = oauth.toHeader(
        oauth.authorize(
          { url, method: "POST" },
          { key: creds.accessToken, secret: creds.accessTokenSecret }
        )
      );
      await fetch(url, {
        method: "POST",
        headers: { ...(headers as unknown as Record<string, string>) },
      }).catch(() => undefined);
    }
  } catch {
    // ignore
  }

  const q = supabaseAdmin
    .from("user_x_credentials")
    .update({
      consumer_key: null,
      consumer_secret_encrypted: null,
      access_token: null,
      access_token_secret_encrypted: null,
      revoked_at: new Date().toISOString(),
      is_active: false,
    })
    .eq("user_id", userId);
  if (accountId) {
    await q.eq("id", accountId);
  } else {
    await q.eq("is_active", true);
  }
}

export async function loadCredentialsByAccountId(
  userId: string,
  accountId: string
): Promise<XCredentials | null> {
  const { data, error } = await supabaseAdmin
    .from("user_x_credentials")
    .select(
      "consumer_key, consumer_secret_encrypted, access_token, access_token_secret_encrypted, x_username, x_user_id, revoked_at, key_id"
    )
    .eq("user_id", userId)
    .eq("id", accountId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.revoked_at) return null;
  if (
    !data.consumer_key ||
    !data.access_token ||
    !data.consumer_secret_encrypted ||
    !data.access_token_secret_encrypted
  ) {
    return null;
  }
  const toBuf = (v: unknown): Buffer => {
    if (Buffer.isBuffer(v)) return v;
    if (v instanceof Uint8Array) return Buffer.from(v);
    if (typeof v === "string") {
      if (v.startsWith("\\x")) return Buffer.from(v.slice(2), "hex");
      return Buffer.from(v, "base64");
    }
    throw new Error("Unexpected encrypted blob type");
  };
  return {
    consumerKey: data.consumer_key,
    consumerSecret: decryptSecret(toBuf(data.consumer_secret_encrypted), data.key_id ?? 1),
    accessToken: data.access_token,
    accessTokenSecret: decryptSecret(toBuf(data.access_token_secret_encrypted), data.key_id ?? 1),
    xUsername: data.x_username,
    xUserId: data.x_user_id,
  };
}

export { makeOAuth };