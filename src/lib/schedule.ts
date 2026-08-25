export type ScheduleActionState = {
  status: "idle" | "error";
  message: string;
};

export const INITIAL_SCHEDULE_ACTION_STATE: ScheduleActionState = {
  status: "idle",
  message: "",
};

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const LOCAL_DATE_TIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

export function isIsoDate(value: string) {
  if (!ISO_DATE_RE.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

export function isLocalDateTime(value: string) {
  if (!LOCAL_DATE_TIME_RE.test(value)) return false;
  const parsed = new Date(`${value}:00Z`);
  return !Number.isNaN(parsed.valueOf()) &&
    parsed.toISOString().slice(0, 16) === value;
}

export function addDays(value: string, days: number) {
  const parsed = new Date(`${value}T12:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

export function startOfWeek(value: string) {
  const parsed = new Date(`${value}T12:00:00Z`);
  const day = parsed.getUTCDay();
  parsed.setUTCDate(parsed.getUTCDate() - (day === 0 ? 6 : day - 1));
  return parsed.toISOString().slice(0, 10);
}

export function vancouverDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Vancouver",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function vancouverDateKey(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Vancouver",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

export function formatScheduleDay(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(`${value}T12:00:00Z`));
}

export function formatScheduleTime(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Vancouver",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatScheduleTimeRange(startsAt: string, endsAt: string) {
  return `${formatScheduleTime(startsAt)} – ${formatScheduleTime(endsAt)}`;
}

export function toVancouverDateTimeLocal(value: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Vancouver",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
}

export function scheduleDurationHours(startsAt: string, endsAt: string) {
  return Math.max(0, (new Date(endsAt).valueOf() - new Date(startsAt).valueOf()) / 3_600_000);
}
