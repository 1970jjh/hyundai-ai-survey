import { NextResponse } from "next/server";
import { clearFailures, isRateLimited, recordFailure, SESSION_COOKIE, SESSION_TTL_MS, signSession, verifyPassword } from "@/lib/auth";
import { clientIp, jsonError, parseBody } from "@/lib/admin";
import { loginSchema } from "@/lib/schemas";
import { ensureSessionSecret, readSettings } from "@/lib/settings";

export async function POST(req: Request) {
  const ip = clientIp(req);
  if (isRateLimited(ip)) return jsonError("로그인 시도가 너무 많습니다. 1분 뒤에 다시 시도하세요.", 429);
  const body = await parseBody(req, loginSchema);
  if ("error" in body) return body.error;
  const settings = await readSettings();
  if (!verifyPassword(body.data.password, settings.passwordHash)) {
    recordFailure(ip);
    return jsonError("비밀번호가 올바르지 않습니다.", 401);
  }
  clearFailures(ip);
  const secret = await ensureSessionSecret();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, signSession(secret, settings.passwordHash), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && !req.url.startsWith("http://"),
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
  return res;
}
