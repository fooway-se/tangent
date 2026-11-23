export function formatChatTimestamp(value: string, now: Date = new Date()): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const time = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(date);
  const dateDay = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const daysAgo = Math.round((today - dateDay) / 86_400_000);

  if (daysAgo <= 0) return time;
  if (daysAgo < 7) return `${daysAgo}d · ${time}`;
  if (daysAgo < 30) return `${Math.floor(daysAgo / 7)}w · ${time}`;
  if (daysAgo < 365) return `${Math.floor(daysAgo / 30)}mo · ${time}`;
  return `${Math.floor(daysAgo / 365)}y · ${time}`;
}
