import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

// 실제 호출 없이 generateContent 의 동작(지연·잘못된 형식)만 흉내 낸다
const calls: { timeout?: number }[] = [];
let behavior: () => Promise<{ text: string }> = async () => ({ text: '{"ok":true}' });

vi.mock("@google/genai", () => ({
  ThinkingLevel: { LOW: "LOW" },
  GoogleGenAI: class {
    models = {
      generateContent: (req: { config: { httpOptions?: { timeout?: number } } }) => {
        calls.push({ timeout: req.config.httpOptions?.timeout });
        return behavior();
      },
    };
  },
}));

const { generateJson, AI_TIMEOUT_MESSAGE, AI_FORMAT_MESSAGE, MIN_ATTEMPT_MS } = await import("@/lib/gemini");

const base = { apiKey: "test-key", model: "gemini-3.7-flash" as const, system: "", prompt: "p", schema: z.object({ ok: z.boolean() }) };

describe("AI 호출 시간 예산", () => {
  beforeEach(() => {
    calls.length = 0;
  });

  it("각 호출의 타임아웃은 남은 시간을 넘지 않는다", async () => {
    behavior = async () => ({ text: '{"ok":true}' });
    await expect(generateJson({ ...base, deadline: Date.now() + 20_000 })).resolves.toEqual({ ok: true });
    expect(calls[0].timeout).toBeLessThanOrEqual(20_000);
    expect(calls[0].timeout).toBeGreaterThan(19_000);
  });

  it("형식이 틀려도 남은 시간이 모자라면 재시도하지 않는다", async () => {
    behavior = async () => ({ text: "not json" });
    await expect(generateJson({ ...base, deadline: Date.now() + MIN_ATTEMPT_MS - 1_000 })).rejects.toThrow(AI_FORMAT_MESSAGE);
    expect(calls).toHaveLength(1);
  });

  it("시간이 넉넉하면 형식 오류에 1회 재시도", async () => {
    let n = 0;
    behavior = async () => ({ text: n++ === 0 ? "not json" : '{"ok":true}' });
    await expect(generateJson({ ...base, deadline: Date.now() + 40_000 })).resolves.toEqual({ ok: true });
    expect(calls).toHaveLength(2);
  });

  it("마감이 지났으면 호출하지 않고 친절한 시간 초과 오류", async () => {
    await expect(generateJson({ ...base, deadline: Date.now() - 1 })).rejects.toMatchObject({ message: AI_TIMEOUT_MESSAGE, status: 504 });
    expect(calls).toHaveLength(0);
  });

  it("SDK 타임아웃은 한국어 시간 초과 오류로", async () => {
    behavior = async () => {
      throw new Error("Request timed out");
    };
    await expect(generateJson({ ...base, deadline: Date.now() + 20_000 })).rejects.toMatchObject({ message: AI_TIMEOUT_MESSAGE, status: 504 });
  });
});
