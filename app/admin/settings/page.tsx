import { isAdmin } from "@/lib/admin";
import { APPS_SCRIPT_CODE } from "@/lib/appsScriptCode";
import { ensureSheetSecret, publicSettings, readSettings } from "@/lib/settings";
import { appsScriptWithSecret, readSheetStatus } from "@/lib/sheets";
import { usesBlob } from "@/lib/store";
import LoginForm from "@/components/admin/LoginForm";
import SettingsView from "@/components/admin/SettingsView";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  if (!(await isAdmin())) return <LoginForm />;
  // 시트용 비밀값은 처음 이 화면을 열 때 만들고, 복사할 Apps Script 코드에 넣어 준다
  const sheetSecret = await ensureSheetSecret();
  const [settings, sheetStatus] = await Promise.all([readSettings(), readSheetStatus()]);
  return (
    <SettingsView
      initial={{ settings: publicSettings(settings), sheetStatus, storage: usesBlob() ? "blob" : "local" }}
      appsScriptCode={appsScriptWithSecret(APPS_SCRIPT_CODE, sheetSecret)}
    />
  );
}
