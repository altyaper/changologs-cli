import { getWorkspaces } from "../api.js";
import { readConfig, resolveBaseUrl, writeConfig } from "../config.js";
import { authorizeInBrowser, registerClient } from "../oauth.js";

export async function login(options: { newClient: boolean }): Promise<void> {
  const stored = await readConfig();
  const baseUrl = resolveBaseUrl(stored);

  // Reuse this machine's registration so repeat logins don't pile up OAuth apps.
  const reuse = !options.newClient && stored.oauthClientId && stored.baseUrl === baseUrl;
  const clientId = reuse ? stored.oauthClientId! : await registerClient(baseUrl);
  if (reuse) {
    console.log("If the browser reports an unknown client, re-run with `changologs login --new-client`.\n");
  }

  const tokens = await authorizeInBrowser(baseUrl, clientId);
  const workspaces = await getWorkspaces({ baseUrl, auth: { kind: "oauth", clientId, tokens } });
  const path = await writeConfig({ baseUrl, oauthClientId: clientId, tokens });
  console.log(`Logged in to ${baseUrl}. ${workspaces.length} workspace(s) available. Saved to ${path}`);
}
