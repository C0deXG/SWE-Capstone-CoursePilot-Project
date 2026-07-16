import { format, formatDistanceToNowStrict, isThisWeek, parseISO } from "date-fns";

export function formatDueDate(value: string) {
  return format(parseISO(value), "MMM d, yyyy | h:mm a");
}

export function formatDueCompact(value: string) {
  return format(parseISO(value), "MMM d | h:mm a");
}

export function formatDueDay(value: string) {
  return format(parseISO(value), "MMM d");
}

export function timeUntil(value: string) {
  return formatDistanceToNowStrict(parseISO(value), { addSuffix: true });
}

export function dueThisWeek(value: string) {
  return isThisWeek(parseISO(value), { weekStartsOn: 1 });
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function fileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
