import { describe, expect, it } from "vitest";
import { clientIp, createRateLimiter } from "@/lib/rateLimit";
import {
  clearFailures, DEFAULT_PASSWORD, initialPassword, hashPassword, isRateLimited, recordFailure, SESSION_TTL_MS, signSession, verifyPassword, verifySession,
} from "@/lib/auth";

describe("비밀번호", () => {
  it("해시가 없으면 기본 비밀번호 20261105", () => {
    expect(DEFAULT_PASSWORD).toBe("20261105");
    expect(verifyPassword("20261105")).toBe(true);
    expect(verifyPassword("wrong")).toBe(false);
  });
  it("해시한 비밀번호만 통과하고, 기본 비밀번호는 더 이상 안 된다", () => {
    const h = hashPassword("new-secret");
    expect(h).not.toContain("new-secret");
    expect(verifyPassword("new-secret", h)).toBe(true);
    expect(verifyPassword("20261105", h)).toBe(false);
    expect(verifyPassword("x", "broken")).toBe(false);
  });
});

describe("세션 쿠키", () => {
  const secret = "s".repeat(64);
  it("서명이 맞으면 통과", () => {
    expect(verifySession(signSession(secret), secret)).toBe(true);
  });
  it("위조·다른 비밀값·빈 값은 거부", () => {
    const t = signSession(secret);
    expect(verifySession(t.replace(/.$/, (c) => (c === "A" ? "B" : "A")), secret)).toBe(false);
    expect(verifySession(t, "other")).toBe(false);
    expect(verifySession(undefined, secret)).toBe(false);
    expect(verifySession(t, undefined)).toBe(false);
    expect(verifySession(`${Date.now() + 99999999}.fake`, secret)).toBe(false);
  });
  it("만료되면 거부", () => {
    const t = signSession(secret, undefined, 0);
    expect(verifySession(t, secret, undefined, SESSION_TTL_MS + 1)).toBe(false);
  });
  it("비밀번호를 바꾸면 기존 세션이 무효", () => {
    const t = signSession(secret, undefined);
    expect(verifySession(t, secret, hashPassword("changed"))).toBe(false);
  });
});

describe("로그인 속도 제한", () => {
  it("1분에 5회 실패하면 막고, 시간이 지나면 풀린다", () => {
    const ip = "1.2.3.4";
    clearFailures(ip);
    for (let i = 0; i < 5; i++) recordFailure(ip, 1000);
    expect(isRateLimited(ip, 2000)).toBe(true);
    expect(isRateLimited(ip, 1000 + 60_001)).toBe(false);
    clearFailures(ip);
    expect(isRateLimited(ip, 2000)).toBe(false);
  });
});

describe("초기 비밀번호", () => {
  it("ADMIN_PASSWORD 가 있으면 그것이 초기 비밀번호, 20261105 는 더 이상 안 된다", () => {
    process.env.ADMIN_PASSWORD = "owner-only-9";
    try {
      expect(initialPassword()).toBe("owner-only-9");
      expect(verifyPassword("owner-only-9")).toBe(true);
      expect(verifyPassword("20261105")).toBe(false);
    } finally {
      delete process.env.ADMIN_PASSWORD;
    }
    expect(verifyPassword("20261105")).toBe(true);
  });
});

describe("IP 요청 제한", () => {
  it("창 안에서 한도를 넘으면 막고, 창이 지나면 풀린다", () => {
    const lim = createRateLimiter(3, 1000);
    expect([1, 2, 3].map(() => lim.hit("a", 0))).toEqual([false, false, false]);
    expect(lim.hit("a", 10)).toBe(true);
    expect(lim.hit("b", 10)).toBe(false);
    expect(lim.hit("a", 1001)).toBe(false);
  });
  it("Vercel 의 x-real-ip 를 x-forwarded-for 보다 먼저 믿는다", () => {
    const req = (h: Record<string, string>) => new Request("http://x", { headers: h });
    expect(clientIp(req({ "x-real-ip": "9.9.9.9", "x-forwarded-for": "1.1.1.1, 9.9.9.9" }))).toBe("9.9.9.9");
    expect(clientIp(req({ "x-forwarded-for": "1.1.1.1, 2.2.2.2" }))).toBe("1.1.1.1");
    expect(clientIp(req({}))).toBe("local");
  });
});
