"use client";

import { useCallback, useEffect, useState } from "react";
import type { Summary } from "@/lib/aggregate";
import type { Insights } from "@/lib/surveys";
import { api } from "@/lib/client";

export const POLL_MS = 10_000;

interface Results {
  summary: Summary;
  insights: Insights;
}

/** 결과 화면이 열려 있고 탭이 보이는 동안만 10초마다 새 응답을 가져온다 */
export function useResults(surveyId: string, initial: Results) {
  const [data, setData] = useState<Results>(initial);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const next = await api<Results>(`/api/surveys/${surveyId}/results`);
      setData(next);
      setUpdatedAt(new Date());
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "결과를 불러오지 못했습니다.");
    }
  }, [surveyId]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const setInsights = useCallback((insights: Insights) => setData((d) => ({ ...d, insights })), []);
  return { ...data, updatedAt, error, refresh, setInsights };
}
