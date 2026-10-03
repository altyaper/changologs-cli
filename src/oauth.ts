import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { createInterface } from "node:readline/promises";
import type { OAuthTokens } from "./config.js";

// Doorkeeper ignores the port when matching loopback IPs (RFC 8252 §7.3), so one
// registration covers whatever free port the callback server lands on. It must be
// the IP literal: "localhost" is not treated as loopback.
const REGISTERED_REDIRECT = "http://127.0.0.1/callback";
const LOGIN_TIMEOUT_MS = 5 * 60 * 1000;

export class OAuthError extends Error {}

const base64url = (buf: Buffer) => buf.toString("base64url");

// Node can't read the macOS PAC file browsers use, so behind a corporate proxy
// it needs HTTPS_PROXY in the environment.
export function unreachableMessage(origin: string, err: unknown): string {
  const cause = (err as { cause?: { code?: string } }).cause?.code ?? (err as Error).message;
  const hint = process.env.HTTPS_PROXY || process.env.https_proxy
    ? ""
    : "\nIf you're behind a proxy, set HTTPS_PROXY (e.g. export HTTPS_PROXY=http://proxy:port).";
  return `Could not reach ${origin} (${cause}).${hint}`;
}

async function postJson<T>(url: string, body: Record<string, unknown>): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new OAuthError(unreachableMessage(new URL(url).origin, err));
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const reason = data.error_description ?? data.error ?? `${res.status} ${res.statusText}`;
    throw new OAuthError(`${url}: ${reason}`);
  }
  return data as T;
}

export async function registerClient(baseUrl: string): Promise<string> {
  const data = await postJson<{ client_id: string }>(`${baseUrl}/oauth/register`, {
    client_name: "Changologs CLI",
    redirect_uris: [REGISTERED_REDIRECT],
    application_type: "native",
  });
  return data.client_id;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

function toTokens(data: TokenResponse): OAuthTokens {
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}

export async function refreshTokens(
  baseUrl: string,
  clientId: string,
  refreshToken: string,
): Promise<OAuthTokens> {
  const data = await postJson<TokenResponse>(`${baseUrl}/oauth/token`, {
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
  });
  return toTokens(data);
}

function openBrowser(url: string): void {
  const [cmd, args] =
    process.platform === "darwin"
      ? ["open", [url]]
      : process.platform === "win32"
        ? ["cmd", ["/c", "start", "", url]]
        : ["xdg-open", [url]];
  spawn(cmd, args, { stdio: "ignore", detached: true }).on("error", () => {}).unref();
}

// Over SSH (or on a Linux box without a display) there's no local browser, and a
// browser elsewhere can't reach our loopback server, so the user pastes the redirect URL.
function isHeadless(): boolean {
  if (process.env.SSH_CONNECTION || process.env.SSH_TTY) return true;
  return process.platform === "linux" && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY;
}

const page = (message: string) =>
  `<!doctype html><meta charset="utf-8"><title>Changologs CLI</title>` +
  `<body style="font-family:system-ui;display:grid;place-items:center;height:90vh">` +
  `<p>${message}</p></body>`;

/**
 * Runs the authorization-code + PKCE flow through the browser and a loopback callback.
 * When headless, the redirect URL can also be pasted into the terminal.
 */
export async function authorizeInBrowser(
  baseUrl: string,
  clientId: string,
  options: { noBrowser?: boolean } = {},
): Promise<OAuthTokens> {
  const headless = options.noBrowser || isHeadless();
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  const state = base64url(randomBytes(16));

  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  const redirectUri = `http://127.0.0.1:${port}/callback`;

  // Returns the code, or the reason the callback was rejected.
  const readCallback = (params: URLSearchParams): { code: string } | { error: string } => {
    if (params.get("state") !== state) return { error: "Login failed: state mismatch." };
    if (params.get("error")) {
      return { error: `Login failed: ${params.get("error_description") ?? params.get("error")}.` };
    }
    const code = params.get("code");
    return code ? { code } : { error: "Login failed: no authorization code returned." };
  };

  const abortPrompt = new AbortController();
  const code = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new OAuthError("Timed out waiting for authorization in the browser.")),
      LOGIN_TIMEOUT_MS,
    );
    const finish = (result: { code: string } | { error: string }) => {
      clearTimeout(timer);
      abortPrompt.abort();
      if ("code" in result) resolve(result.code);
      else reject(new OAuthError(result.error));
    };

    server.on("request", (req, res) => {
      const url = new URL(req.url ?? "/", redirectUri);
      if (url.pathname !== "/callback") {
        res.writeHead(404).end();
        return;
      }
      const result = readCallback(url.searchParams);
      const message = "code" in result ? "Logged in to the Changologs CLI. You can close this tab." : result.error;
      res.writeHead("code" in result ? 200 : 400, { "Content-Type": "text/html" }).end(page(message));
      finish(result);
    });

    const authorizeUrl = new URL(`${baseUrl}/oauth/authorize`);
    authorizeUrl.search = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: "api",
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
    }).toString();

    if (!headless) {
      console.log(`Opening your browser to authorize the CLI. If it doesn't open, visit:\n\n  ${authorizeUrl}\n`);
      openBrowser(authorizeUrl.toString());
      return;
    }

    console.log(
      `Open this URL in a browser on any machine to authorize the CLI:\n\n  ${authorizeUrl}\n\n` +
        `After you approve, the browser lands on a 127.0.0.1 page that won't load. ` +
        `Copy that page's full URL from the address bar and paste it below.\n`,
    );
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question("Redirect URL: ", { signal: abortPrompt.signal })
      .then((answer) => {
        let params: URLSearchParams;
        try {
          params = new URL(answer.trim()).searchParams;
        } catch {
          return finish({ error: "Login failed: that doesn't look like a URL." });
        }
        finish(readCallback(params));
      })
      .catch(() => {}) // aborted because the loopback callback arrived first
      .finally(() => rl.close());
  }).finally(() => server.close());

  const data = await postJson<TokenResponse>(`${baseUrl}/oauth/token`, {
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    code_verifier: verifier,
  });
  return toTokens(data);
}
