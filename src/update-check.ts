import { readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { CONFIG_DIR } from "./config.js";

// Replaced with package.json's version by scripts/bundle.mjs. A source build
// (tsc) leaves it undefined, so we read package.json next to dist/ instead.
declare const __CHANGOLOGS_VERSION__: string | undefined;

const BUNDLED = typeof __CHANGOLOGS_VERSION__ === "string";

export const VERSION: string =
  typeof __CHANGOLOGS_VERSION__ === "string"
    ? __CHANGOLOGS_VERSION__
    : JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;

// github.com redirects this to .../releases/tag/v<version>. Unlike
// api.github.com it isn't limited to 60 requests an hour per IP.
const LATEST_URL = "https://github.com/altyaper/changologs-cli/releases/latest";
const INSTALL_CMD =
  'sh -c "$(curl -fsSL https://raw.githubusercontent.com/altyaper/changologs-cli/main/install.sh)"';
const CACHE_PATH = join(CONFIG_DIR, "update-check.json");
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const TIMEOUT_MS = 3000;

interface UpdateCache {
  /** Epoch milliseconds. */
  lastChecked: number;
  latestVersion?: string;
}

// Only nag a person at a terminal; scripts, CI and API-key runs stay quiet.
function enabled(): boolean {
  const env = process.env;
  return Boolean(
    process.stderr.isTTY &&
      !env.CI &&
      !env.CHANGOLOGS_NO_UPDATE_CHECK &&
      !(env.CHANGOLOGS_CLIENT_ID && env.CHANGOLOGS_CLIENT_SECRET),
  );
}

async function fetchLatestVersion(): Promise<string | undefined> {
  const res = await fetch(LATEST_URL, { redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS) });
  return res.headers.get("location")?.match(/\/tag\/v?([^/]+)$/)?.[1];
}

/** Compares x.y.z versions; true if `a` is newer than `b`. */
function isNewer(a: string, b: string): boolean {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0);
  }
  return false;
}

/**
 * Resolves to an "update available" notice, or null. Hits GitHub at most once
 * a day and never rejects, so a network problem can't break a command.
 */
export async function checkForUpdate(): Promise<string | null> {
  if (!enabled()) return null;
  try {
    let cache: UpdateCache = { lastChecked: 0 };
    try {
      cache = JSON.parse(await readFile(CACHE_PATH, "utf8"));
    } catch {}

    if (Date.now() - cache.lastChecked > CHECK_INTERVAL_MS) {
      // Record the attempt even if it fails, so an offline machine doesn't retry every run.
      const latestVersion = await fetchLatestVersion().catch(() => undefined);
      cache = { lastChecked: Date.now(), latestVersion: latestVersion ?? cache.latestVersion };
      await mkdir(CONFIG_DIR, { recursive: true, mode: 0o700 });
      await writeFile(CACHE_PATH, JSON.stringify(cache) + "\n");
    }

    if (!cache.latestVersion || !isNewer(cache.latestVersion, VERSION)) return null;
    const how = BUNDLED ? INSTALL_CMD : "git pull && npm install";
    return `\nUpdate available: ${VERSION} → ${cache.latestVersion}\nRun: ${how}`;
  } catch {
    return null;
  }
}
