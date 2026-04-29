import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, "..", ".env") });

import { initDb } from "../database.js";
import { runDailyMaintenanceCycle } from "../jobs.js";

async function main() {
  console.log("[daily-maintenance] Inicializando DB...");
  await initDb();
  console.log("[daily-maintenance] Ejecutando ciclo diario...");
  await runDailyMaintenanceCycle();
  console.log("[daily-maintenance] Ciclo diario completo.");
}

main().catch((err) => {
  console.error("[daily-maintenance] Error:", err.message);
  process.exit(1);
});
