import { notFound } from "next/navigation";
import { isAdmin } from "@/lib/admin";
import { summarize } from "@/lib/aggregate";
import { readSettings } from "@/lib/settings";
import { getInsights, getSurvey, listResponses } from "@/lib/surveys";
import LoginForm from "@/components/admin/LoginForm";
import SurveyWorkspace from "@/components/admin/SurveyWorkspace";

export const dynamic = "force-dynamic";

export default async function SurveyPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return <LoginForm />;
  const { id } = await params;
  const survey = await getSurvey(id);
  if (!survey) notFound();
  const [responses, insights, settings] = await Promise.all([listResponses(id), getInsights(id), readSettings()]);
  return (
    <SurveyWorkspace
      initialSurvey={survey}
      initialSummary={summarize(survey.questions, responses)}
      initialInsights={insights}
      hasKey={Boolean(settings.geminiKey)}
    />
  );
}
