import type { Metadata, Viewport } from "next";
import "./globals.css";
import { STORAGE_MISSING_MESSAGE, storageMissing } from "@/lib/store";

export const metadata: Metadata = {
  title: "AI 서베이랩 — 설문 생성·응답·분석",
  description: "한 줄 요청으로 설문을 만들고, 링크·QR로 응답을 받고, AI가 주관식까지 읽어 결과 보고서 초안을 씁니다.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#f4f0e8" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=Noto+Serif+KR:wght@400;500;600;700&display=swap"
        />
      </head>
      <body>
        {storageMissing() ? (
          <main className="setup-error" role="alert" data-testid="storage-missing">
            <h1>저장소 연결이 필요합니다</h1>
            <p>{STORAGE_MISSING_MESSAGE}</p>
          </main>
        ) : (
          children
        )}
      </body>
    </html>
  );
}
