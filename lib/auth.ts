import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export const DEFAULT_PASSWORD = "20261105";
export const SESSION_COOKIE = "survey_admin";
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/** 저장된 해시가 없으면 기본 비밀번호(20261105)와 비교 */
export function verifyPassword(password: string, stored?: string): boolean {
  if (!stored) return safeEqual(password, DEFAULT_PASSWORD);
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  return safeEqual(scryptSync(password, salt, 32).toString("hex"), hash);
}

/** 비밀번호를 바꾸면 기존 세션이 모두 무효가 되도록 해시 버전을 서명에 섞는다 */
function mac(secret: string, exp: number, passwordHash = "default"): string {
  return createHmac("sha256", secret).update(`${exp}.${passwordHash}`).digest("base64url");
}

export function signSession(secret: string, passwordHash?: string, now = Date.now()): string {
  const exp = now + SESSION_TTL_MS;
  return `${exp}.${mac(secret, exp, passwordHash)}`;
}

export function verifySession(
  token: string | undefined,
  secret: string | undefined,
  passwordHash?: string,
  now = Date.now(),
): boolean {
  if (!token || !secret) return false;
  const [expStr, sig] = token.split(".");
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || !sig || exp < now) return false;
  return safeEqual(sig, mac(secret, exp, passwordHash));
}

/** 로그인 시도 제한: IP당 1분에 5회 실패까지 */
const attempts = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 60_000;
const MAX_FAILS = 5;

export function isRateLimited(ip: string, now = Date.now()): boolean {
  const a = attempts.get(ip);
  return Boolean(a && a.resetAt > now && a.count >= MAX_FAILS);
}

export function recordFailure(ip: string, now = Date.now()): void {
  const a = attempts.get(ip);
  const fresh = !a || a.resetAt <= now;
  attempts.set(ip, fresh ? { count: 1, resetAt: now + WINDOW_MS } : { ...a, count: a.count + 1 });
}

export function clearFailures(ip: string): void {
  attempts.delete(ip);
}
