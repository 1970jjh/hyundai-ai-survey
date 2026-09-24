import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { z } from "zod";
import { SESSION_COOKIE, verifySession } from "./auth";
import { readSettings } from "./settings";
import { AiError } from "./gemini";

export async function isAdmin(): Promise<boolean> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return false;
  const s = await readSettings();
  return verifySession(token, s.sessionSecret, s.passwordHash);
}

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/** 관리자 API 공통: 쿠키 검증 실패 시 401 응답을 돌려준다 */
export async function requireAdmin(): Promise<NextResponse | null> {
  return (await isAdmin()) ? null : jsonError("관리자 로그인이 필요합니다.", 401);
}

export async function parseBody<T extends z.ZodType>(
  req: Request,
  schema: T,
): Promise<{ data: z.infer<T> } | { error: NextResponse }> {
  const raw = await req.json().catch(() => undefined);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다.";
    return { error: jsonError(msg) };
  }
  return { data: parsed.data };
}

export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

/** AI 호출 실패를 친절한 한국어 오류 응답으로 */
export function aiFailure(err: unknown) {
  if (err instanceof AiError) return jsonError(err.message, err.status);
  const message = err instanceof Error && /[가-힣]/.test(err.message) ? err.message : "AI 처리 중 문제가 생겼습니다.";
  return jsonError(message, 500);
}
