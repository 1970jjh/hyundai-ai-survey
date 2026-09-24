// apps-script/Code.gs → lib/appsScriptCode.ts (설정 화면의 «코드 복사»용). Code.gs 를 고친 뒤 실행.
import { readFileSync, writeFileSync } from "node:fs";

const code = readFileSync(new URL("../apps-script/Code.gs", import.meta.url), "utf8");
const out = `// 자동 생성 파일 — apps-script/Code.gs 를 고친 뒤 \`npm run gen:apps-script\`\nexport const APPS_SCRIPT_CODE = ${JSON.stringify(code)};\n`;
writeFileSync(new URL("../lib/appsScriptCode.ts", import.meta.url), out);
