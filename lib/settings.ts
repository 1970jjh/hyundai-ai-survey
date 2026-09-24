import { randomBytes } from "node:crypto";
import { getStore } from "./store";
import type { GeminiModel } from "./schemas";

export interface Settings {
  passwordHash?: string;
  sessionSecret?: string;
  /** 앱 → Apps Script 요청 검증용 공유 비밀값(관리자 화면의 코드에 자동으로 들어간다) */
  sheetSecret?: string;
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

/** 조건부 쓰기: 동시에 바뀐 다른 항목(비밀번호·키·비밀값)을 덮어쓰지 않는다 */
export async function writeSettings(patch: Partial<Settings>): Promise<Settings> {
  const saved = await getStore().updateJson<Partial<Settings>>(PATH, (cur) => ({ ...cur, ...patch }));
  return { ...DEFAULTS, ...saved };
}

/** 비밀값이 없을 때만 한 번 만든다. 동시에 두 요청이 와도 먼저 저장된 하나만 남는다 */
async function ensureSecret(key: "sessionSecret" | "sheetSecret"): Promise<string> {
  const current = await readSettings();
  if (current[key]) return current[key];
  const fresh = randomBytes(32).toString("hex");
  const saved = await getStore().updateJson<Partial<Settings>>(PATH, (cur) =>
    cur?.[key] ? undefined : { ...cur, [key]: fresh },
  );
  return saved?.[key] ?? fresh;
}

export const ensureSessionSecret = () => ensureSecret("sessionSecret");
export const ensureSheetSecret = () => ensureSecret("sheetSecret");

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
