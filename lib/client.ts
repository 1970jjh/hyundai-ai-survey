/** 브라우저에서 앱 API 호출. 실패하면 서버의 한국어 오류 문구로 Error를 던진다 */
export async function api<T = unknown>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(path, {
    method: init?.method ?? (init?.body === undefined ? "GET" : "POST"),
    headers: init?.body === undefined ? undefined : { "Content-Type": "application/json" },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(data.error || `요청이 실패했습니다 (HTTP ${res.status})`);
  return data as T;
}

export function errorText(err: unknown): string {
  return err instanceof Error ? err.message : "알 수 없는 오류가 생겼습니다.";
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
