import type { QuestionType } from "./schemas";

export type TemplateKey = "satisfaction" | "needs" | "pulse";

export interface TemplateQuestion {
  type: QuestionType;
  text: string;
  required: boolean;
  options?: string[];
}

export interface Template {
  key: TemplateKey;
  label: string;
  title: string;
  description: string;
  questions: TemplateQuestion[];
}

/** 앱에 내장된 기본 문항. «AI로 다듬기»는 과정명에 맞게 이 문항을 고쳐 쓴다. */
export const TEMPLATES: Template[] = [
  {
    key: "satisfaction",
    label: "교육 만족도",
    title: "교육 만족도 설문",
    description: "오늘 교육에 대한 솔직한 의견을 들려주세요. 약 2분이면 끝납니다.",
    questions: [
      { type: "scale", text: "이번 교육의 전반적인 만족도는 어떠셨나요?", required: true },
      { type: "scale", text: "교육 내용이 실제 업무에 도움이 될 것 같나요?", required: true },
      { type: "scale", text: "강사의 설명은 이해하기 쉬웠나요?", required: true },
      { type: "scale", text: "교육 시간과 진행 속도는 적절했나요?", required: true },
      {
        type: "single",
        text: "가장 도움이 된 부분은 무엇인가요?",
        required: true,
        options: ["이론 설명", "사례 공유", "실습", "토론·질의응답"],
      },
      { type: "nps", text: "동료에게 이 교육을 추천할 의향은 얼마나 되나요?", required: true },
      { type: "text", text: "가장 좋았던 점을 알려 주세요.", required: false },
      { type: "text", text: "다음 교육에서 개선하거나 더 다뤘으면 하는 내용이 있나요?", required: false },
    ],
  },
  {
    key: "needs",
    label: "교육 전 요구조사",
    title: "교육 전 요구조사",
    description: "교육을 여러분에게 맞추기 위해 미리 여쭙니다. 약 3분이면 끝납니다.",
    questions: [
      { type: "scale", text: "이번 교육 주제에 대한 현재 이해 수준은 어느 정도인가요?", required: true },
      {
        type: "multi",
        text: "교육에서 가장 기대하는 것을 모두 골라 주세요.",
        required: true,
        options: ["기초 개념 정리", "업무 적용 사례", "직접 해 보는 실습", "도구·템플릿", "다른 부서 사례"],
      },
      {
        type: "single",
        text: "선호하는 교육 방식은 무엇인가요?",
        required: true,
        options: ["강의 중심", "실습 중심", "토론·워크숍", "혼합형"],
      },
      { type: "scale", text: "지금 업무에서 이 주제가 얼마나 필요하다고 느끼나요?", required: true },
      { type: "text", text: "업무에서 겪고 있는 구체적인 어려움이 있다면 적어 주세요.", required: false },
      { type: "text", text: "강사에게 미리 전하고 싶은 질문이나 요청이 있나요?", required: false },
    ],
  },
  {
    key: "pulse",
    label: "조직문화 펄스",
    title: "조직문화 펄스 서베이",
    description: "우리 조직의 요즘 분위기를 짧게 점검합니다. 응답은 익명으로 모입니다.",
    questions: [
      { type: "scale", text: "요즘 우리 팀에서 일하는 것에 만족하나요?", required: true },
      { type: "scale", text: "팀 안에서 의견을 자유롭게 말할 수 있나요?", required: true },
      { type: "scale", text: "내 일이 조직의 목표와 어떻게 연결되는지 알고 있나요?", required: true },
      { type: "scale", text: "최근 한 달 동안 성장하고 있다고 느꼈나요?", required: true },
      {
        type: "multi",
        text: "요즘 업무에서 가장 큰 부담은 무엇인가요? (복수 선택)",
        required: false,
        options: ["업무량", "불명확한 목표", "소통 부족", "회의·보고", "성장 기회 부족"],
      },
      { type: "nps", text: "지인에게 우리 회사를 일하기 좋은 곳으로 추천할 의향은?", required: true },
      { type: "text", text: "우리 조직이 한 가지를 바꾼다면 무엇이면 좋을까요?", required: false },
    ],
  },
];

export function getTemplate(key: TemplateKey): Template {
  const t = TEMPLATES.find((x) => x.key === key);
  if (!t) throw new Error(`알 수 없는 템플릿: ${key}`);
  return t;
}
