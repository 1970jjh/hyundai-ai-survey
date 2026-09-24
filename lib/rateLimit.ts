/**
 * IP당 요청 수 제한(고정 창).
 * ponytail: 서버리스 인스턴스 메모리 — 인스턴스마다 따로 세고 재시작하면 초기화된다.
 * 여러 인스턴스에 걸친 정확한 한도가 필요해지면 Upstash/Redis 같은 공유 저장소로 옮길 것.
 */
export function createRateLimiter(limit: number, windowMs: number) {
  const hits = new Map<string, { count: number; resetAt: number }>();

  function prune(now: number) {
    if (hits.size < 5000) return;
    for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
  }

  return {
    /** 이미 한도에 닿았는지(세지 않음) */
    blocked(key: string, now = Date.now()): boolean {
      const h = hits.get(key);
      return Boolean(h && h.resetAt > now && h.count >= limit);
    },
    /** 한 번 세고, 한도를 넘었으면 true */
    hit(key: string, now = Date.now()): boolean {
      prune(now);
      const h = hits.get(key);
      const next = !h || h.resetAt <= now ? { count: 1, resetAt: now + windowMs } : { ...h, count: h.count + 1 };
      hits.set(key, next);
      return next.count > limit;
    },
    clear(key: string): void {
      hits.delete(key);
    },
  };
}

/** 클라이언트 IP: Vercel 이 덮어쓰는 x-real-ip 를 먼저 믿고, 없으면 x-forwarded-for 첫 값 */
export function clientIp(req: Request): string {
  const real = req.headers.get("x-real-ip")?.trim();
  if (real) return real;
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}
