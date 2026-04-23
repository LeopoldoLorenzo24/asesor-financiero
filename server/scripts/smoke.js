import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const PORT = parseInt(process.env.SMOKE_PORT || "3101", 10);
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = path.resolve(SCRIPT_DIR, "..");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function fetchJson(url) {
  const res = await fetch(url);
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: res.status, json, text };
}

async function waitForHealth(baseUrl, maxWaitMs = 25000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < maxWaitMs) {
    try {
      const { status, json } = await fetchJson(`${baseUrl}/api/health`);
      if (status === 200 && json?.status === "ok") return;
    } catch {
      // server still booting
    }
    await sleep(500);
  }
  throw new Error("Timeout esperando /api/health");
}

async function runChecks(baseUrl) {
  await waitForHealth(baseUrl);

  const health = await fetchJson(`${baseUrl}/api/health`);
  assert(health.status === 200, `health status esperado 200, obtuve ${health.status}`);
  assert(health.json?.status === "ok", "health JSON invalido");

  const ranking = await fetchJson(`${baseUrl}/api/ranking`);
  assert(ranking.status === 401, `ranking sin auth esperado 401, obtuve ${ranking.status}`);

  const metrics = await fetchJson(`${baseUrl}/api/internal/metrics`);
  assert(metrics.status === 401, `metrics sin auth esperado 401, obtuve ${metrics.status}`);

  const usage = await fetchJson(`${baseUrl}/api/ai/usage`);
  assert(usage.status === 401, `ai/usage sin auth esperado 401, obtuve ${usage.status}`);
}

async function runManagedServer() {
  const baseUrl = `http://localhost:${PORT}`;
    const child = spawn(process.execPath, ["--import", "tsx", "index.js"], {
    cwd: SERVER_DIR,
    env: { ...process.env, PORT: String(PORT) },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += String(chunk);
  });

  try {
    await runChecks(baseUrl);
  } finally {
    child.kill("SIGTERM");
    await sleep(1200);
    if (!child.killed) child.kill("SIGKILL");
    if (stderr.trim()) {
      console.log("[smoke] server stderr:");
      console.log(stderr.trim().slice(0, 2000));
    }
  }
}

async function main() {
  const externalBaseUrl = String(process.env.SMOKE_BASE_URL || "").trim();
  if (externalBaseUrl) {
    await runChecks(externalBaseUrl.replace(/\/+$/, ""));
    return;
  }
  await runManagedServer();
}

main()
  .then(() => {
    console.log("Smoke checks: OK");
  })
  .catch((err) => {
    console.error("Smoke checks: FAIL");
    console.error(err.message);
    process.exit(1);
  });

