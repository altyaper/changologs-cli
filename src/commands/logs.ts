import { getRecentLogs } from "../api.js";
import type { Session } from "../config.js";
import { browseLogs, pickWorkspace } from "./pick.js";

const LIMIT = 10;

export async function logs(session: Session): Promise<void> {
  const workspace = await pickWorkspace(session);
  if (!workspace) return;

  const recent = (await getRecentLogs(session, workspace.hash_id)).slice(0, LIMIT);
  if (recent.length === 0) {
    console.log(`No logs in ${workspace.name}.`);
    return;
  }
  console.log(`\nLast ${recent.length} logs in ${workspace.name}\n`);
  await browseLogs(session, recent);
}
