import { readConfig, writeConfig, type Session } from "./config.js";
import { refreshTokens, unreachableMessage } from "./oauth.js";

export interface Workspace {
  id: number;
  name: string;
  hash_id: string;
}

export interface Log {
  id: number;
  hash_id: string;
  title_text: string;
  /** TipTap HTML. */
  text: string;
  emoji: string | null;
  updated_at: string;
}

export interface TaskList {
  id: number;
  name: string;
  /** How the web app orders the list's tasks. */
  sort_by: "date" | "my_order" | "deadline" | "title";
}

export interface Task {
  id: number;
  task_list_id: number;
  title: string;
  details: string | null;
  /** YYYY-MM-DD. */
  date: string | null;
  /** HH:MM. */
  time: string | null;
  /** YYYY-MM-DD. */
  deadline: string | null;
  completed_at: string | null;
  position: number;
  /** Set on repeating tasks; completing one moves `date` to the next occurrence. */
  repeat_unit: number | null;
}

export class ApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

const EXPIRY_SKEW_MS = 60 * 1000;

async function refresh(session: Session): Promise<void> {
  if (session.auth.kind !== "oauth") return;
  try {
    session.auth.tokens = await refreshTokens(
      session.baseUrl,
      session.auth.clientId,
      session.auth.tokens.refreshToken,
    );
  } catch {
    throw new ApiError("Session expired. Run `changologs login` again.", 401);
  }
  await writeConfig({ ...(await readConfig()), tokens: session.auth.tokens });
}

function authHeaders(session: Session): Record<string, string> {
  const { auth } = session;
  return auth.kind === "apiKey"
    ? { "Client-Id": auth.clientId, "Client-Secret": auth.clientSecret }
    : { Authorization: `Bearer ${auth.tokens.accessToken}` };
}

async function send(session: Session, path: string, method: string): Promise<Response> {
  try {
    return await fetch(`${session.baseUrl}${path}`, {
      method,
      headers: { Accept: "application/json", ...authHeaders(session) },
    });
  } catch (err) {
    throw new ApiError(unreachableMessage(session.baseUrl, err));
  }
}

async function request<T>(session: Session, path: string, method = "GET"): Promise<T> {
  const { auth } = session;
  if (auth.kind === "oauth" && auth.tokens.expiresAt - EXPIRY_SKEW_MS < Date.now()) {
    await refresh(session);
  }
  let res = await send(session, path, method);
  // The token can be revoked server-side before it expires; one refresh decides.
  if (res.status === 401 && auth.kind === "oauth") {
    await refresh(session);
    res = await send(session, path, method);
  }
  if (res.status === 401) {
    throw new ApiError("Unauthorized. Run `changologs login`, or check your API key.", 401);
  }
  if (!res.ok) {
    throw new ApiError(`${res.status} ${res.statusText} from ${path}`, res.status);
  }
  return (await res.json()) as T;
}

export async function getWorkspaces(session: Session): Promise<Workspace[]> {
  const data = await request<{ workspaces: Workspace[] }>(session, "/workspaces");
  return data.workspaces;
}

export async function getRecentLogs(session: Session, workspaceHashId: string): Promise<Log[]> {
  const params = new URLSearchParams({ workspace_id: workspaceHashId });
  const data = await request<{ logs: Log[] }>(session, `/logs/recent?${params}`);
  return data.logs;
}

export async function searchLogs(session: Session, workspaceHashId: string, query: string): Promise<Log[]> {
  const params = new URLSearchParams({ workspace_id: workspaceHashId, query });
  const data = await request<{ logs: Log[] }>(session, `/logs/search?${params}`);
  return data.logs;
}

export async function getTaskLists(session: Session, workspaceHashId: string): Promise<TaskList[]> {
  const params = new URLSearchParams({ workspace_id: workspaceHashId });
  const data = await request<{ task_lists: TaskList[] }>(session, `/api/task-lists?${params}`);
  return data.task_lists;
}

export async function getTasks(session: Session, taskListId: number): Promise<Task[]> {
  const data = await request<{ tasks: Task[] }>(session, `/api/task-lists/${taskListId}/tasks`);
  return data.tasks;
}

/** Returns the updated task: completed, or for a repeating task, moved to its next date. */
export async function completeTask(session: Session, task: Task): Promise<Task> {
  return request<Task>(session, `/api/task-lists/${task.task_list_id}/tasks/${task.id}/complete`, "POST");
}
