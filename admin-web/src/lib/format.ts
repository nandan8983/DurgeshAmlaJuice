/** Display helpers. Rupees and Indian date order throughout. */

export const rupees = (value: number | null | undefined): string =>
  value === null || value === undefined
    ? '—'
    : `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export const shortDate = (value: string | null | undefined): string => {
  if (!value) return '—';
  const date = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' });
};

export const dateTime = (value: string | null | undefined): string => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const todayIso = (): string => {
  // The business day is IST; derive it from the browser's local calendar.
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10);
};

export const startOfMonthIso = (): string => `${todayIso().slice(0, 7)}-01`;

export const titleCase = (value: string): string =>
  value.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
