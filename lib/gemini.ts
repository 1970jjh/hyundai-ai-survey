import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { z } from "zod";
import type { GeminiModel } from "./schemas";

export class AiError extends Error {
  constructor(message: string, readonly status = 502) {
    super(message);
  }
}

export const NO_KEY_MESSAGE = "Gemini API 키가 없습니다. 관리자에게 API 키 등록을 요청하세요(설정 › Gemini API 키).";

// Gemini 응답 스키마에 넘길 키워드만 남긴다(zod가 만드는 $schema 등 제거).
// maxItems·minimum·maximum 은 뺀다: 중첩 배열 상한이 겹치면 Gemini가 «스키마가 너무 복잡»으로 400을 낸다.
// 상한은 받은 뒤 zod 검증이 지킨다.
const ALLOWED = new Set([
  "type", "properties", "required", "items", "enum", "description", "minItems",
  "anyOf", "additionalProperties", "propertyOrdering", "format", "title",
]);

export function toGeminiSchema(schema: z.ZodType): unknown {
  const strip = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(strip);
    if (!node || typeof node !== "object") return node;
    const entries = Object.entries(node as Record<string, unknown>)
      .filter(([k]) => ALLOWED.has(k))
      .map(([k, v]) => [k, k === "properties" ? mapValues(v as Record<string, unknown>, strip) : strip(v)]);
    return Object.fromEntries(entries);
  };
  return strip(z.toJSONSchema(schema, { target: "draft-2020-12" }));
}

function mapValues(obj: Record<string, unknown>, fn: (v: unknown) => unknown) {
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, fn(v)]));
}

export function friendlyError(err: unknown): AiError {
  if (err instanceof AiError) return err;
  const raw = err instanceof Error ? err.message : String(err);
  const status = (err as { status?: number }).status;
  if (status === 400 && /API key|API_KEY/i.test(raw)) return new AiError("Gemini API 키가 올바르지 않습니다. 설정에서 키를 확인하세요.", 400);
  if (status === 401 || status === 403) return new AiError("Gemini API 키가 거부되었습니다. 설정에서 키를 확인하세요.", 400);
  if (status === 404) return new AiError("선택한 Gemini 모델을 찾을 수 없습니다. 설정에서 다른 모델을 골라 보세요.", 400);
  if (status === 429) return new AiError("Gemini 사용량 한도에 걸렸습니다. 잠시 후 다시 시도하세요.", 429);
  if (/timed? ?out|abort/i.test(raw)) return new AiError("Gemini 응답이 너무 오래 걸립니다. 잠시 후 다시 시도하세요.", 504);
  return new AiError("AI 호출 중 문제가 생겼습니다. 잠시 후 다시 시도하세요.");
}

export interface GenerateOptions<T extends z.ZodType> {
  apiKey?: string;
  model: GeminiModel;
  system: string;
  prompt: string;
  schema: T;
  timeoutMs?: number;
}

/** JSON 스키마로 받아 zod로 검증. 형식이 어긋나면 1회 재시도. */
export async function generateJson<T extends z.ZodType>(opts: GenerateOptions<T>): Promise<z.infer<T>> {
  if (!opts.apiKey) throw new AiError(NO_KEY_MESSAGE, 400);
  const ai = new GoogleGenAI({ apiKey: opts.apiKey, httpOptions: { timeout: opts.timeoutMs ?? 90_000 } });
  const responseJsonSchema = toGeminiSchema(opts.schema);
  let lastIssue = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    let text: string | undefined;
    try {
      const res = await ai.models.generateContent({
        model: opts.model,
        contents: attempt === 0 ? opts.prompt : `${opts.prompt}\n\n(직전 응답이 형식에 맞지 않았습니다: ${lastIssue}. 스키마에 정확히 맞춘 JSON만 출력하세요.)`,
        config: {
          systemInstruction: opts.system,
          responseMimeType: "application/json",
          responseJsonSchema,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      });
      text = res.text;
    } catch (err) {
      throw friendlyError(err);
    }
    const parsed = safeJson(text);
    const checked = opts.schema.safeParse(parsed);
    if (checked.success) return checked.data;
    lastIssue = checked.error.issues[0]?.message ?? "JSON 파싱 실패";
  }
  throw new AiError("AI가 올바른 형식의 결과를 돌려주지 않았습니다. 다시 시도해 주세요.");
}

function safeJson(text: string | undefined): unknown {
  try {
    return JSON.parse(text ?? "");
  } catch {
    return undefined;
  }
}

/** 설정 화면의 «연결 테스트» */
export async function pingGemini(apiKey: string | undefined, model: GeminiModel): Promise<number> {
  const started = Date.now();
  await generateJson({
    apiKey,
    model,
    system: "You are a health check.",
    prompt: '{"ok": true} 를 그대로 돌려주세요.',
    schema: z.object({ ok: z.boolean() }),
    timeoutMs: 30_000,
  });
  return Date.now() - started;
}
