import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface OAuthTokens {
  accessToken: string;
  refreshToken: string;
  /** Epoch milliseconds. */
  expiresAt: number;
}

export interface StoredConfig {
  baseUrl?: string;
  oauthClientId?: string;
  tokens?: OAuthTokens;
  /** hash_id of the workspace picked last, preselected next time. */
  lastWorkspace?: string;
}

export type Auth =
  | { kind: "apiKey"; clientId: string; clientSecret: string }
  | { kind: "oauth"; clientId: string; tokens: OAuthTokens };

export interface Session {
  baseUrl: string;
  auth: Auth;
}

export const DEFAULT_BASE_URL = "https://changologs.com";

export const CONFIG_DIR = join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "changologs");

const CONFIG_PATH = join(CONFIG_DIR, "config.json");

export async function readConfig(): Promise<StoredConfig> {
  try {
    return JSON.parse(await readFile(CONFIG_PATH, "utf8"));
  } catch {
    return {};
  }
}

export async function writeConfig(config: StoredConfig): Promise<string> {
  await mkdir(dirname(CONFIG_PATH), { recursive: true, mode: 0o700 });
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", { mode: 0o600 });
  return CONFIG_PATH;
}

export function resolveBaseUrl(stored: StoredConfig): string {
  return (process.env.CHANGOLOGS_BASE_URL ?? stored.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
}

// An API key in the environment wins, so scripts and CI need no browser login.
export async function loadSession(): Promise<Session | null> {
  const stored = await readConfig();
  const baseUrl = resolveBaseUrl(stored);
  const { CHANGOLOGS_CLIENT_ID: clientId, CHANGOLOGS_CLIENT_SECRET: clientSecret } = process.env;
  if (clientId && clientSecret) {
    return { baseUrl, auth: { kind: "apiKey", clientId, clientSecret } };
  }
  if (stored.oauthClientId && stored.tokens) {
    return { baseUrl, auth: { kind: "oauth", clientId: stored.oauthClientId, tokens: stored.tokens } };
  }
  return null;
}
