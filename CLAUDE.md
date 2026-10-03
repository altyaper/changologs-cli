# changologs-cli

Interactive terminal client for [Changologs](https://changologs.com). TypeScript, ESM, Node 24.5+,
two runtime deps (`@inquirer/prompts`, `turndown`). User-facing docs are in `README.md`; this file
covers what you need to know to change the code.

## Commands

```sh
npm run typecheck              # the only automated check; there is no test suite
npm run build                  # tsc -> dist/index.js (source installs, `npm link`)
npm run bundle                 # esbuild -> dist/changologs.js (what users install)
node dist/changologs.js help
```

## Layout

- `src/index.ts`: argv dispatch, help text, top-level error handling, update notice.
- `src/commands/*.ts`: one file per command. `pick.ts` holds the shared workspace picker and log browser.
- `src/api.ts`: every server call goes through `request()`, which refreshes OAuth tokens (before expiry, and once on a 401).
- `src/oauth.ts`: browser login (dynamic client registration + PKCE + loopback callback, paste fallback over SSH).
- `src/config.ts`: `~/.config/changologs/config.json` (honors `XDG_CONFIG_HOME`), written `0600`.
- `src/render.ts`: TipTap HTML -> terminal Markdown, labels, pager.
- `src/update-check.ts`: version constant and the once-a-day "update available" check.

## Releasing and distribution

- **Pushing to `main` releases only if `package.json` `version` changed.** `.github/workflows/release.yml`
  creates `v<version>` with `dist/changologs.js` attached; if that tag exists it does nothing. Bump
  with `npm version <patch|minor> --no-git-tag-version` (updates the lockfile too). Don't create tags by hand.
- **`install.sh` is served straight from `main`** (raw.githubusercontent.com), not from a release.
  Changes to it reach every user as soon as they're pushed, without a version bump.
- The version reaches the code two ways: esbuild `define`s `__CHANGOLOGS_VERSION__` in the bundle,
  while `tsc` builds read `../package.json` at runtime. Keep both paths working (`update-check.ts`).
- The update check reads the latest tag from the `github.com/.../releases/latest` 302 redirect,
  not `api.github.com` (60 requests/hour per IP). It's skipped outside a TTY, in CI, with an API
  key, or with `CHANGOLOGS_NO_UPDATE_CHECK=1`.
- `package-lock.json` must resolve against the public npm registry, since CI runs `npm ci` on GitHub.
  If your machine uses a private registry, check that `resolved` URLs didn't change before committing.
- This repo is on github.com, not a GitHub Enterprise host: use `git` and the web UI. The `gh` CLI
  may be logged in to a different host.

## Talking to the server

The server is the Rails app in the `changologs` repo (`config/routes.rb`, `config/routes/*.rb`,
`app/controllers`). Things that aren't obvious from the client code:

- **Paths are inconsistent:** logs live at `/workspaces` and `/logs/...`, tasks under `/api/task-lists/...`.
- **Workspace scoping is a `workspace_id=<hash_id>` query param.** Leave it off and the server
  silently uses the user's default workspace instead of erroring. Pass it to every list endpoint.
  Per-item task routes are scoped by owner, not workspace.
- **Always send `Accept: application/json`.** Rails skips CSRF protection only for JSON requests,
  so POSTs without it fail.
- OAuth has a single `api` scope that covers reads and writes.
- Completing a repeating task doesn't set `completed_at`; `POST .../complete` returns the task moved
  to its next `date`. Only the last occurrence gets `completed_at`.
- Task `date`/`deadline` are `YYYY-MM-DD` and `time` is `HH:MM` in the user's local calendar.
  Compare them as strings against the local date, never as `Date` instants (UTC shifts the day).
- The `changologs-mcp` repo is another client of the same API and a useful reference for request shapes.

## Conventions

- **Interactive by default, plain when piped.** Commands use inquirer prompts on a TTY and print
  plain lists when `process.stdout.isTTY` is false (see `browseLogs`, `tasks`). Colors go through
  `dim`/`bold` in `render.ts`, which already handle non-TTY.
- **Errors meant for users are `ApiError` or `OAuthError`.** `index.ts` prints only their message;
  any other error is printed in full as a bug. Ctrl+C in a prompt (`ExitPromptError`) exits 130 quietly.
- **No top-level `await` in `index.ts`.** If a prompt can never resolve (stdin closed), Node prints an
  "unsettled top-level await" warning. Keep the `main().catch().then()` chain.
- The shebang is `node --use-env-proxy` so `fetch` honors `HTTPS_PROXY`. Node ignores OS/PAC proxy
  settings. Without the flag, every request times out behind a corporate proxy. Run local builds
  with `node --use-env-proxy` when you're behind one.
- When writing the config, spread the existing one (`{ ...(await readConfig()), ... }`) so you don't
  drop fields like `lastWorkspace`.
- Commits follow Conventional Commits (`feat:`, `fix:`, `ci:`, `docs:`). Keep `README.md` and the
  `HELP` text in `index.ts` in sync when adding commands or flags.

## Testing changes

There are no automated tests, so check behavior by hand without touching real data:

- Point the CLI at a throwaway config: `XDG_CONFIG_HOME=$(mktemp -d)`. Seed `changologs/config.json`
  with `baseUrl` set to a small local `node:http` mock server and fake tokens with a future `expiresAt`.
  `baseUrl` in the config must match the server you're hitting, or `login` treats the session as foreign.
- Set `CHANGOLOGS_NO_UPDATE_CHECK=1` to keep the update check out of the output.
- Prompts need a TTY. Drive them with `expect` (send `" "` to tick, `"\r"` to submit, `"\033[B"` for
  down), or use `script -q /dev/null <cmd>` when you only need `isTTY`.
- Don't run write commands (marking tasks done, etc.) against changologs.com to test. Read-only calls
  against a real login are fine for confirming response shapes.
- To test `install.sh`, run it with a temporary `HOME` and an explicit `PATH` that still includes `node`.
