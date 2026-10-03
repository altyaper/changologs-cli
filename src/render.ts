import { spawnSync } from "node:child_process";
import TurndownService from "turndown";
import type { Log, Task } from "./api.js";

const tty = process.stdout.isTTY;
export const dim = (s: string) => (tty ? `\x1b[2m${s}\x1b[22m` : s);
const bold = (s: string) => (tty ? `\x1b[1m${s}\x1b[22m` : s);

export function relativeTime(iso: string): string {
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31536000],
    ["month", 2592000],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  const fmt = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  for (const [unit, size] of units) {
    if (seconds >= size) return fmt.format(-Math.floor(seconds / size), unit);
  }
  return "just now";
}

export function logLabel(log: Log): string {
  const title = log.title_text?.trim() || "Untitled";
  return `${log.emoji ? `${log.emoji} ` : ""}${title}  ${dim(relativeTime(log.updated_at))}`;
}

export function printLogList(baseUrl: string, logs: Log[]): void {
  logs.forEach((log, i) => {
    console.log(`${String(i + 1).padStart(2)}. ${logLabel(log)}`);
    console.log(`    ${dim(`${baseUrl}/l/${log.hash_id}`)}`);
  });
}

// Task dates are plain YYYY-MM-DD strings in the user's local calendar, so
// compare them as strings against today's local date rather than as instants.
function localIsoDate(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function formatTaskDate(iso: string): string {
  if (iso === localIsoDate()) return "Today";
  if (iso === localIsoDate(1)) return "Tomorrow";
  if (iso === localIsoDate(-1)) return "Yesterday";
  const [y, m, d] = iso.split("-").map(Number);
  const sameYear = y === new Date().getFullYear();
  return new Date(y, m - 1, d).toLocaleDateString("en", {
    weekday: sameYear ? "short" : undefined,
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
  });
}

export function taskLabel(task: Task): string {
  const today = localIsoDate();
  const meta: string[] = [];
  if (task.date) {
    meta.push(`${task.date < today ? "overdue · " : ""}${formatTaskDate(task.date)}${task.time ? ` ${task.time}` : ""}`);
  }
  if (task.deadline) meta.push(`deadline ${formatTaskDate(task.deadline)}`);
  if (task.repeat_unit != null) meta.push("repeats");
  return meta.length ? `${task.title}  ${dim(meta.join(" · "))}` : task.title;
}

export function printTaskList(name: string, tasks: Task[]): void {
  console.log(bold(name));
  if (tasks.length === 0) console.log(dim("  (nothing to do)"));
  for (const task of tasks) console.log(`- [ ] ${taskLabel(task)}`);
  console.log();
}

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
});

// Output is read in a terminal, not re-parsed as Markdown, so backslash escapes are noise.
turndown.escape = (text) => text;

// Mention nodes are empty spans with their text in data attributes. Turndown drops
// empty elements (and the whitespace beside them), so inline the text up front.
// Attribute values are already HTML-escaped, so they're safe to reuse as text.
function inlineMentions(html: string): string {
  return html
    .replace(/<span\b[^>]*\bdata-log-title="([^"]*)"[^>]*><\/span>/g, "[[$1]]")
    .replace(/<span\b[^>]*\bdata-date="([^"]*)"[^>]*><\/span>/g, "$1");
}

// Rules added later take precedence, so taskItem must come after listItem.
turndown.addRule("listItem", {
  filter: "li",
  replacement: (content, node) => {
    const parent = node.parentNode as HTMLElement;
    const prefix =
      parent.nodeName === "OL"
        ? `${Number(parent.getAttribute("start") ?? 1) + Array.from(parent.children).indexOf(node as HTMLElement)}. `
        : "- ";
    const body = content.trim().replace(/\n{2,}/g, "\n").replace(/\n/g, `\n${" ".repeat(prefix.length)}`);
    return `${prefix}${body}\n`;
  },
});
turndown.addRule("taskItem", {
  filter: (node) => node.nodeName === "LI" && node.hasAttribute("data-checked"),
  replacement: (content, node) => {
    const checked = (node as HTMLElement).getAttribute("data-checked") === "true";
    return `- [${checked ? "x" : " "}] ${content.trim().replace(/\n+/g, " ")}\n`;
  },
});

export function renderLog(baseUrl: string, log: Log): string {
  const title = log.title_text?.trim() || "Untitled";
  const body = turndown.turndown(inlineMentions(log.text ?? "")).trim() || dim("(empty)");
  const meta = dim(`Updated ${relativeTime(log.updated_at)} · ${baseUrl}/l/${log.hash_id}`);
  return `${bold(`${log.emoji ? `${log.emoji} ` : ""}${title}`)}\n${meta}\n\n${body}\n`;
}

/** Writes to $PAGER (default `less`) on a terminal so long logs are scrollable. */
export function page(text: string): void {
  if (!tty) {
    process.stdout.write(text);
    return;
  }
  const [cmd, ...args] = (process.env.PAGER || "less -FRX").split(/\s+/);
  const result = spawnSync(cmd, args, { input: text, stdio: ["pipe", "inherit", "inherit"] });
  if (result.error) process.stdout.write(text);
}
