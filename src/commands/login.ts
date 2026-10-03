import { ApiError, getWorkspaces } from "../api.js";
import { readConfig, resolveBaseUrl, writeConfig } from "../config.js";
import { authorizeInBrowser, registerClient } from "../oauth.js";

export async function login(options: { newClient: boolean; noBrowser: boolean; force: boolean }): Promise<void> {
  const stored = await readConfig();
  const baseUrl = resolveBaseUrl(stored);

  // A saved session that still works (refreshing it if needed) means there's nothing to do.
  if (!options.force && !options.newClient && stored.oauthClientId && stored.tokens && stored.baseUrl === baseUrl) {
    try {
      const workspaces = await getWorkspaces({
        baseUrl,
        auth: { kind: "oauth", clientId: stored.oauthClientId, tokens: stored.tokens },
      });
      console.log(
        `Already logged in to ${baseUrl}. ${workspaces.length} workspace(s) available.\n` +
          "Run `changologs login --force` to log in again.",
      );
      return;
    } catch (err) {
      // 401 means the session is dead; anything else (e.g. unreachable) would fail the login too.
      if (!(err instanceof ApiError && err.status === 401)) throw err;
    }
  }

  // Reuse this machine's registration so repeat logins don't pile up OAuth apps.
  const reuse = !options.newClient && stored.oauthClientId && stored.baseUrl === baseUrl;
  const clientId = reuse ? stored.oauthClientId! : await registerClient(baseUrl);
  if (reuse) {
    console.log("If the browser reports an unknown client, re-run with `changologs login --new-client`.\n");
  }

  const tokens = await authorizeInBrowser(baseUrl, clientId, { noBrowser: options.noBrowser });
  const workspaces = await getWorkspaces({ baseUrl, auth: { kind: "oauth", clientId, tokens } });
  const path = await writeConfig({ ...(await readConfig()), baseUrl, oauthClientId: clientId, tokens });
  console.log(`Logged in to ${baseUrl}. ${workspaces.length} workspace(s) available. Saved to ${path}`);
}
