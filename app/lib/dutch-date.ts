/** Display-only formatting; accounting dates stay ISO (yyyy-mm-dd) internally. */
export function formatDutchDate(value: string | undefined) {
  if (!value) return "";
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T|$)/.exec(value);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : value;
}
export function parseDutchDate(value: string) {
  const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(value);
  if (!match) return "";
  const iso = `${match[3]}-${match[2]}-${match[1]}`;
  const time = Date.parse(iso);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0,10) === iso ? iso : "";
}
export function formatDutchTimestamp(value: string) {
  const parts = new Intl.DateTimeFormat("nl-NL", { timeZone: "Europe/Amsterdam", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(value));
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("day")}-${part("month")}-${part("year")}, ${part("hour")}:${part("minute")}`;
}
