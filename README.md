# changologs-cli

Command-line client for [Changologs](https://changologs.com). You can browse and search your workspace logs and read them from the terminal.

## Requirements

- Node.js **24.5 or newer**. The CLI's shebang uses `node --use-env-proxy`, and older versions don't have that flag.
- `curl` (`git` and `npm` only if you build from source)

## Install

```sh
sh -c "$(curl -fsSL https://raw.githubusercontent.com/altyaper/changologs-cli/main/install.sh)"
```

The script downloads the prebuilt CLI (one bundled JavaScript file) from the latest [GitHub Release](https://github.com/altyaper/changologs-cli/releases) into `~/.changologs-cli` and symlinks `changologs` into `~/.local/bin`. Nothing is compiled on your machine. Run the same command again to update.

If `~/.local/bin` isn't on your `PATH`, add it to your shell profile (`~/.zshrc`, `~/.bashrc`):

```sh
export PATH="$HOME/.local/bin:$PATH"
```

To change where things go, set these variables before you run the script:

| Variable             | Default             | Purpose                                 |
| -------------------- | ------------------- | --------------------------------------- |
| `CHANGOLOGS_DIR`     | `~/.changologs-cli` | Where the CLI file is downloaded        |
| `CHANGOLOGS_BIN_DIR` | `~/.local/bin`      | Where the `changologs` link goes        |
| `CHANGOLOGS_VERSION` | `latest`            | Release tag to install, e.g. `v0.1.0`   |

### From source

```sh
git clone https://github.com/altyaper/changologs-cli.git
cd changologs-cli
npm install      # also builds via the prepare script
npm link         # puts `changologs` on your PATH
```

### Updates

Once a day, the CLI checks GitHub for a newer release. If it finds one, it prints the update command after your command finishes. The check runs alongside the command, gives up after 3 seconds, and caches its result in `~/.config/changologs/update-check.json`. It is skipped when output isn't a terminal, when `CI` is set, or when an API key is in use. Set `CHANGOLOGS_NO_UPDATE_CHECK=1` to turn it off. `changologs --version` prints the installed version.

### Uninstall

```sh
rm -rf ~/.changologs-cli ~/.local/bin/changologs ~/.config/changologs
```

## Setup

### Log in with the browser

```sh
changologs login
```

This opens your browser so you can authorize the CLI. When you approve, the browser redirects back to a temporary server on `127.0.0.1`, and the CLI saves your tokens to `~/.config/changologs/config.json` (or `$XDG_CONFIG_HOME/changologs/config.json`). The file is created with `0600` permissions. Access tokens refresh automatically. If the refresh fails, the CLI asks you to run `changologs login` again. If you are already logged in, `changologs login` says so and stops. Use `--force` to log in again anyway.

If the browser doesn't open by itself, copy the URL the CLI prints into your browser.

#### Over SSH (e.g. a Raspberry Pi)

When the CLI runs over SSH, or on Linux with no display, it doesn't try to open a browser (force this anywhere with `changologs login --no-browser`). Instead:

1. Open the URL the CLI prints in a browser on your laptop and approve.
2. The browser then goes to a `http://127.0.0.1:<port>/callback?code=…` page that fails to load. That's expected: the CLI's callback server is on the Pi, not your laptop.
3. Copy that page's full URL from the address bar and paste it at the CLI's `Redirect URL:` prompt.

If you forward the port instead (`ssh -L <port>:127.0.0.1:<port> pi`), the redirect reaches the CLI by itself and the prompt goes away.

If the browser says the client is unknown, the saved OAuth registration is no longer valid. Register a new one:

```sh
changologs login --new-client
```

### Use an API key (scripts and CI)

If both of these variables are set, the CLI uses them and ignores any saved browser login:

```sh
export CHANGOLOGS_CLIENT_ID=...
export CHANGOLOGS_CLIENT_SECRET=...
```

### Behind a proxy

Node can't read the PAC file your browser uses. If you're behind a corporate proxy, set `HTTPS_PROXY` so the CLI can reach changologs.com:

```sh
export HTTPS_PROXY=http://proxy.example.com:8080
```

### Use a different server

```sh
export CHANGOLOGS_BASE_URL=http://localhost:3000   # default: https://changologs.com
```

## Usage

```
changologs <command>

Commands:
  login [--force] [--new-client] [--no-browser]
                        Authorize this machine in the browser; skipped if already logged in
                        (--force logs in again; --new-client re-registers; --no-browser
                        prints a URL to open elsewhere, automatic over SSH)
  logs                  Pick a workspace, list its 10 most recent logs, open one to read it
  search [query]        Search a workspace's logs and open one to read it
  tasks                 Show a workspace's open tasks and tick the ones you've done
  version               Print the installed version
  help                  Show this message
```

### `changologs logs`

Shows the 10 most recent logs in a workspace. Pick one to read it, then pick another or choose **Quit**.

```sh
changologs logs
```

### `changologs search`

Searches a workspace's logs. Pass the query as arguments, or leave them off and the CLI asks for one.

```sh
changologs search release notes
changologs search            # asks for the query
```

### `changologs tasks`

Shows a workspace's open tasks, one task list at a time, in the order the web app uses for that list. Each task shows its date and time, its deadline, and whether it repeats; the highlighted task's details appear below the list. Tick tasks with space and press enter to mark them done. Completing a repeating task moves it to its next date, and the CLI prints that date. Press enter without ticking anything to just look.

When output is piped, the CLI prints every list as a `- [ ]` checklist instead.

### Workspaces

If you belong to more than one workspace, the CLI asks which one to use. Next time, the workspace you picked last is selected by default. If you have only one workspace, the CLI uses it without asking.

### Reading logs

Logs are converted to Markdown and shown in `$PAGER` (default `less -FRX`), so long logs scroll. Press `q` to go back to the list.

If stdout isn't a terminal (for example, when you pipe the output), `logs` and `search` print the list without the interactive picker:

```sh
changologs logs | grep -i deploy
```

Press `Ctrl+C` at any prompt to quit.

## Development

```sh
npm install
npm run dev        # tsc --watch
npm run typecheck
node dist/index.js help
```

### Releasing

The install script downloads `changologs.js` from the latest GitHub Release. To publish one, bump `version` in `package.json` and push to `main`. Installed CLIs start showing the update notice within a day.

On every push to `main`, the `Release` workflow (`.github/workflows/release.yml`) checks whether `v<version>` is already released. If it isn't, the workflow bundles the CLI with esbuild (`npm run bundle`), creates the `v<version>` tag, and attaches `dist/changologs.js` to a new release. Pushes that don't change the version do nothing. To test the bundle locally, run `npm run bundle && node dist/changologs.js help`.

## License

MIT
