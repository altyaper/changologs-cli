#!/usr/bin/env -S node --use-env-proxy
import { ApiError } from "./api.js";
import { login } from "./commands/login.js";
import { logs } from "./commands/logs.js";
import { search } from "./commands/search.js";
import { loadSession } from "./config.js";
import { OAuthError } from "./oauth.js";
import { checkForUpdate, VERSION } from "./update-check.js";

const HELP = `Usage: changologs <command>

Commands:
  login [--force] [--new-client] [--no-browser]
                        Authorize this machine in the browser; skipped if already logged in
                        (--force logs in again; --new-client re-registers; --no-browser
                        prints a URL to open elsewhere, automatic over SSH)
  logs                  Pick a workspace, list its 10 most recent logs, open one to read it
  search [query]        Search a workspace's logs and open one to read it
  version               Print the installed version
  help                  Show this message

Environment:
  CHANGOLOGS_BASE_URL                          server (default https://changologs.com)
  CHANGOLOGS_CLIENT_ID, CHANGOLOGS_CLIENT_SECRET  use an API key instead of the browser login
  CHANGOLOGS_NO_UPDATE_CHECK=1                 don't check GitHub for a newer release`;

async function main([command, ...args]: string[]): Promise<void> {
  switch (command) {
    case "login":
      return login({
        newClient: args.includes("--new-client"),
        noBrowser: args.includes("--no-browser"),
        force: args.includes("--force"),
      });
    case "logs": {
      const session = await loadSession();
      if (!session) throw new ApiError("Not logged in. Run `changologs login` first.");
      return logs(session);
    }
    case "search": {
      const session = await loadSession();
      if (!session) throw new ApiError("Not logged in. Run `changologs login` first.");
      return search(session, args);
    }
    case "version":
    case "--version":
    case "-v":
      console.log(VERSION);
      return;
    case undefined:
    case "help":
    case "--help":
    case "-h":
      console.log(HELP);
      return;
    default:
      console.error(`Unknown command: ${command}\n`);
      console.log(HELP);
      process.exitCode = 1;
  }
}

// Runs alongside the command (usually while the user is in a prompt); the
// notice prints after the command's own output.
const update = checkForUpdate();

await main(process.argv.slice(2)).catch((err: unknown) => {
  // Ctrl+C inside a prompt rejects with ExitPromptError; exit quietly.
  if (err instanceof Error && err.name === "ExitPromptError") {
    process.exitCode = 130;
    return;
  }
  console.error(err instanceof ApiError || err instanceof OAuthError ? err.message : err);
  process.exitCode = 1;
});

const notice = await update;
if (notice) console.error(notice);
