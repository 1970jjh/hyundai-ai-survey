import { isAdmin } from "@/lib/admin";
import { publicSettings, readSettings } from "@/lib/settings";
import { readSheetStatus } from "@/lib/sheets";
import { usesBlob } from "@/lib/store";
import LoginForm from "@/components/admin/LoginForm";
import SettingsView from "@/components/admin/SettingsView";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  if (!(await isAdmin())) return <LoginForm />;
  const [settings, sheetStatus] = await Promise.all([readSettings(), readSheetStatus()]);
  return (
    <SettingsView
      initial={{ settings: publicSettings(settings), sheetStatus, storage: usesBlob() ? "blob" : "local" }}
    />
  );
}
