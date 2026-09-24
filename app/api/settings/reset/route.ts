import { NextResponse } from "next/server";
import { z } from "zod";
import { SESSION_COOKIE } from "@/lib/auth";
import { parseBody, requireAdmin } from "@/lib/admin";
import { resetAll } from "@/lib/surveys";

const schema = z.object({ confirm: z.literal("초기화"), includeSettings: z.boolean().default(false) });

export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const body = await parseBody(req, schema);
  if ("error" in body) return body.error;
  await resetAll(body.data.includeSettings);
  const res = NextResponse.json({ ok: true, loggedOut: body.data.includeSettings });
  if (body.data.includeSettings) res.cookies.delete(SESSION_COOKIE);
  return res;
}
