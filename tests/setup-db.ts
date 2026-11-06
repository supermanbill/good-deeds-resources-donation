import { execSync } from "node:child_process";
import { rmSync } from "node:fs";

/** 每次測試前重建測試資料庫（prisma/test.db），不動開發資料庫 */
export default function setup() {
  rmSync("prisma/test.db", { force: true });
  execSync("npx prisma db push --skip-generate", { env: { ...process.env, DATABASE_URL: "file:./test.db" }, stdio: "ignore" });
}
