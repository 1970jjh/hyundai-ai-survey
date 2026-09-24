import { NextResponse } from "next/server";
import { parseBody, requireAdmin } from "@/lib/admin";
import { settingsPatchSchema } from "@/lib/schemas";
import { publicSettings, readSettings, writeSettings, type Settings } from "@/lib/settings";
import { readSheetStatus } from "@/lib/sheets";
import { usesBlob } from "@/lib/store";

async function view(s: Settings) {
  return { settings: publicSettings(s), sheetStatus: await readSheetStatus(), storage: usesBlob() ? "blob" : "local" };
}

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  return NextResponse.json(await view(await readSettings()));
}

export async function PATCH(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const body = await parseBody(req, settingsPatchSchema);
  if ("error" in body) return body.error;
  const { geminiKey, ...rest } = body.data;
  // 키 입력칸이 비어 있으면 기존 키를 그대로 둔다
  const patch: Partial<Settings> = { ...rest, ...(geminiKey ? { geminiKey } : {}) };
  return NextResponse.json(await view(await writeSettings(patch)));
}
