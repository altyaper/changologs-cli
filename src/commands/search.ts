import { input } from "@inquirer/prompts";
import { searchLogs } from "../api.js";
import type { Session } from "../config.js";
import { browseLogs, pickWorkspace } from "./pick.js";

export async function search(session: Session, words: string[]): Promise<void> {
  const workspace = await pickWorkspace(session);
  if (!workspace) return;

  const query = words.join(" ").trim() || (await input({ message: "Search", required: true })).trim();
  const results = await searchLogs(session, workspace.hash_id, query);
  if (results.length === 0) {
    console.log(`No logs matching "${query}" in ${workspace.name}.`);
    return;
  }
  console.log(`\n${results.length} result(s) for "${query}" in ${workspace.name}\n`);
  await browseLogs(session, results);
}
