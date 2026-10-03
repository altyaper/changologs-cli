import { Separator, checkbox, select } from "@inquirer/prompts";
import { completeTask, getTaskLists, getTasks, type Task, type TaskList } from "../api.js";
import type { Session } from "../config.js";
import { dim, formatTaskDate, printTaskList, taskLabel } from "../render.js";
import { pickWorkspace } from "./pick.js";

const QUIT = Symbol("quit");

// Missing values sort last, as in the web app.
const byMaybe = (a: string | null, b: string | null) => (a ?? "￿").localeCompare(b ?? "￿");

/** Open tasks, in the order the web app shows the list. */
function openTasks(list: TaskList, tasks: Task[]): Task[] {
  const open = tasks.filter((t) => !t.completed_at);
  switch (list.sort_by) {
    case "my_order":
      return open.sort((a, b) => a.position - b.position);
    case "title":
      return open.sort((a, b) => a.title.localeCompare(b.title));
    case "deadline":
      return open.sort((a, b) => byMaybe(a.deadline, b.deadline) || a.position - b.position);
    default:
      return open.sort((a, b) => byMaybe(a.date, b.date) || byMaybe(a.time, b.time) || a.position - b.position);
  }
}

/** Shows a list's open tasks; the ones the user ticks are marked done. */
async function reviewList(session: Session, list: TaskList): Promise<void> {
  const open = openTasks(list, await getTasks(session, list.id));
  if (open.length === 0) {
    console.log(`Nothing to do in ${list.name}.`);
    return;
  }
  const done = await checkbox({
    message: `${list.name}: tick tasks to mark them done`,
    choices: open.map((task) => ({
      name: taskLabel(task),
      short: task.title,
      value: task,
      description: task.details ?? undefined,
    })),
    pageSize: Math.min(open.length, 15),
  });
  for (const task of done) {
    const updated = await completeTask(session, task);
    // A repeating task isn't finished; it moves on to its next occurrence.
    const next = !updated.completed_at && updated.date ? dim(`  next: ${formatTaskDate(updated.date)}`) : "";
    console.log(`✓ ${task.title}${next}`);
  }
}

export async function tasks(session: Session): Promise<void> {
  const workspace = await pickWorkspace(session);
  if (!workspace) return;

  const lists = await getTaskLists(session, workspace.hash_id);
  if (lists.length === 0) {
    console.log(`No task lists in ${workspace.name}.`);
    return;
  }
  if (!process.stdout.isTTY) {
    for (const list of lists) printTaskList(list.name, openTasks(list, await getTasks(session, list.id)));
    return;
  }
  if (lists.length === 1) return reviewList(session, lists[0]);

  let last: TaskList | undefined;
  for (;;) {
    const choice = await select<TaskList | typeof QUIT>({
      message: "Open a task list",
      choices: [...lists.map((list) => ({ name: list.name, value: list })), new Separator(), { name: "Quit", value: QUIT }],
      default: last,
      pageSize: lists.length + 2,
    });
    if (choice === QUIT) return;
    await reviewList(session, choice);
    last = choice;
  }
}
