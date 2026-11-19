/**
 * Supabase 서버 설정.
 *
 * Vercel → Project Settings → Environment Variables
 *   SUPABASE_URL           예) https://<project-ref>.supabase.co
 *   SUPABASE_SECRET_KEY    sb_secret_... (서버 전용, 절대 클라이언트로 내보내지 않는다)
 */

export const SUPABASE_TIMEOUT_MS = 4_000;

export type SupabaseConfig = {
  secret: string;
  url: string;
};

export function readSupabaseConfig(): SupabaseConfig | null {
  const url = (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "")
    .trim()
    .replace(/\/+$/, "");
  const secret = (
    process.env.SUPABASE_SECRET_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    ""
  ).trim();

  if (!url || !secret) return null;

  return { secret, url };
}

export function supabaseHeaders(secret: string) {
  return {
    Authorization: `Bearer ${secret}`,
    "Content-Type": "application/json",
    apikey: secret,
  };
}
