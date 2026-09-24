import { rmSync } from "node:fs";

export default function globalSetup() {
  rmSync(".data-live", { recursive: true, force: true });
}
