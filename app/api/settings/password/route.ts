import { NextResponse } from "next/server";
import { hashPassword, SESSION_COOKIE, SESSION_TTL_MS, signSession, verifyPassword } from "@/lib/auth";
import { jsonError, parseBody, requireAdmin } from "@/lib/admin";
import { passwordChangeSchema } from "@/lib/schemas";
import { ensureSessionSecret, readSettings, writeSettings } from "@/lib/settings";

export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const body = await parseBody(req, passwordChangeSchema);
  if ("error" in body) return body.error;
  const s = await readSettings();
  if (!verifyPassword(body.data.current, s.passwordHash)) return jsonError("현재 비밀번호가 올바르지 않습니다.", 400);
  const passwordHash = hashPassword(body.data.next);
  await writeSettings({ passwordHash });
  // 다른 기기의 세션은 무효가 되고, 지금 기기는 새 쿠키로 로그인 유지
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, signSession(await ensureSessionSecret(), passwordHash), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && !req.url.startsWith("http://"),
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
  return res;
}
