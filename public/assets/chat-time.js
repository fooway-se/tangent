export function formatChatTimestamp(value, now = new Date()) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime()))
        return '';
    const time = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(date);
    const dateDay = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
    const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    const daysAgo = Math.round((today - dateDay) / 86_400_000);
    if (daysAgo === 0)
        return time;
    if (daysAgo === 1)
        return `Yesterday · ${time}`;
    if (daysAgo > 1 && daysAgo < 7)
        return `${daysAgo} days ago · ${time}`;
    const dateOptions = {
        day: 'numeric',
        month: 'short',
        ...(date.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
    };
    const calendarDate = new Intl.DateTimeFormat(undefined, dateOptions).format(date);
    return `${calendarDate} · ${time}`;
}
