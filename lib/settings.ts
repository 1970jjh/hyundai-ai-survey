import { randomBytes } from "node:crypto";
import { getStore } from "./store";
import type { GeminiModel } from "./schemas";

export interface Settings {
  passwordHash?: string;
  sessionSecret?: string;
  geminiKey?: string;
  model: GeminiModel;
  sheetUrl?: string;
  sheetEnabled: boolean;
}

const PATH = "settings.json";
const DEFAULTS: Settings = { model: "gemini-3.7-flash", sheetEnabled: false };

export async function readSettings(): Promise<Settings> {
  const saved = await getStore().getJson<Partial<Settings>>(PATH);
  return { ...DEFAULTS, ...(saved ?? {}) };
}

export async function writeSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await readSettings()), ...patch };
  await getStore().putJson(PATH, next);
  return next;
}

/** 서명 비밀값: 첫 실행 때 랜덤 생성해 settings에 저장 */
export async function ensureSessionSecret(): Promise<string> {
  const s = await readSettings();
  if (s.sessionSecret) return s.sessionSecret;
  const secret = randomBytes(32).toString("hex");
  await writeSettings({ sessionSecret: secret });
  return secret;
}

export function maskKey(key?: string): string {
  return key ? `•••• •••• ${key.slice(-4)}` : "";
}

/** 화면으로 내보내도 되는 설정(비밀값 제외) */
export function publicSettings(s: Settings) {
  return {
    hasGeminiKey: Boolean(s.geminiKey),
    geminiKeyMasked: maskKey(s.geminiKey),
    model: s.model,
    sheetUrl: s.sheetUrl ?? "",
    sheetEnabled: s.sheetEnabled,
    passwordChanged: Boolean(s.passwordHash),
  };
}
export type PublicSettings = ReturnType<typeof publicSettings>;
