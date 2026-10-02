import { Separator, select } from "@inquirer/prompts";
import { getWorkspaces, type Log, type Workspace } from "../api.js";
import { readConfig, writeConfig, type Session } from "../config.js";
import { logLabel, page, printLogList, renderLog } from "../render.js";

export async function pickWorkspace(session: Session): Promise<Workspace | null> {
  const workspaces = await getWorkspaces(session);
  if (workspaces.length === 0) {
    console.log("No workspaces found.");
    return null;
  }
  if (workspaces.length === 1) return workspaces[0];

  const stored = await readConfig();
  const hashId = await select({
    message: "Select a workspace",
    choices: workspaces.map((w) => ({ name: w.name, value: w.hash_id })),
    default: stored.lastWorkspace,
  });
  if (hashId !== stored.lastWorkspace) await writeConfig({ ...stored, lastWorkspace: hashId });
  return workspaces.find((w) => w.hash_id === hashId)!;
}

const QUIT = Symbol("quit");

/** Lets the user open logs from the list one after another; plain list when piped. */
export async function browseLogs(session: Session, logs: Log[]): Promise<void> {
  if (!process.stdout.isTTY) {
    printLogList(session.baseUrl, logs);
    return;
  }
  let last: Log | undefined;
  for (;;) {
    const choice = await select<Log | typeof QUIT>({
      message: "Open a log",
      choices: [
        ...logs.map((log) => ({ name: logLabel(log), value: log })),
        new Separator(),
        { name: "Quit", value: QUIT },
      ],
      default: last,
      pageSize: logs.length + 2,
    });
    if (choice === QUIT) return;
    page(renderLog(session.baseUrl, choice));
    last = choice;
  }
}
