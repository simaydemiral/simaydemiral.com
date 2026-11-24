#!/usr/bin/env node
/* The real Worker and page on this machine, with a throwaway database.
 *
 * --local keeps D1 on disk under .state, which is wiped on every run. Cloudflare
 * credentials are removed from the environment, and the secret is a test value,
 * so nothing here can reach the live site or a real deck.
 */
const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const STATE = path.join(__dirname, ".state");
const VARS = path.join(STATE, "e2e.vars");
const PORT = "8817";

fs.rmSync(STATE, { recursive: true, force: true });
fs.mkdirSync(STATE, { recursive: true });
fs.writeFileSync(VARS, "SESSION_SECRET=e2e-only-not-a-real-secret\n");

const env = { ...process.env, WRANGLER_SEND_METRICS: "false", CI: "1" };
for (const name of Object.keys(env)) {
  if (/^CLOUDFLARE_|TOKEN|SECRET|PASSWORD|API_KEY/i.test(name)) delete env[name];
}

const wrangler = ["--yes", "wrangler@4.134.0"];
const schema = spawnSync("npx", [...wrangler, "d1", "execute", "vocab", "--local",
  "--persist-to", STATE, "--file", "schema.sql"], { cwd: ROOT, env, encoding: "utf8" });
if (schema.status !== 0) {
  console.error(schema.stderr || schema.stdout);
  process.exit(1);
}

const dev = spawn("npx", [...wrangler, "dev", "--local", "--ip", "127.0.0.1", "--port", PORT,
  "--persist-to", STATE, "--env-file", VARS, "--show-interactive-dev-session=false"],
  { cwd: ROOT, env, stdio: "inherit", detached: true });

function stop() {
  try { process.kill(-dev.pid, "SIGTERM"); } catch (e) {}
  process.exit(0);
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
dev.on("exit", (code) => process.exit(code || 0));
