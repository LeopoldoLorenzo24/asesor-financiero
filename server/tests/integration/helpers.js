// ============================================================
// INTEGRATION TEST HELPERS
// ============================================================

import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "../../.env") });

import { initDb } from "../../database.js";

let dbInitialized = false;

export async function setupTestDb() {
  if (!dbInitialized) {
    await initDb();
    dbInitialized = true;
  }
}

export async function getTestToken() {
  const { generateToken } = await import("../../auth.js");
  return generateToken(1, "test@example.com");
}

export async function authHeader() {
  const token = await getTestToken();
  return { Authorization: `Bearer ${token}` };
}
