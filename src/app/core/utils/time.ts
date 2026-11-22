export interface WallClock {
  date: string;
  time: string;
  seconds: number;
}

export type DateFormat = 'short' | 'long' | 'time' | 'datetime';

const pad = (n: number) => String(n).padStart(2, '0');

export function toWallClock(unixSeconds: number, offsetMinutes: number): WallClock {
  const d = new Date((unixSeconds + offsetMinutes * 60) * 1000);
  return {
    date: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
    time: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`,
    seconds: d.getUTCSeconds(),
  };
}

export function fromWallClock(date: string, time: string, seconds: number, offsetMinutes: number): number | null {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const tm = /^(\d{2}):(\d{2})/.exec(time);
  if (!dm || !tm) return null;
  const [y, mo, d, h, mi] = [+dm[1], +dm[2], +dm[3], +tm[1], +tm[2]];
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const ms = Date.UTC(y, mo - 1, d, h, mi, seconds);
  const check = new Date(ms);
  if (check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null;
  return Math.floor(ms / 1000) - offsetMinutes * 60;
}

export function formatOffset(offsetMinutes: number): string {
  const sign = offsetMinutes < 0 ? '-' : '+';
  const abs = Math.abs(offsetMinutes);
  return `UTC${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

export function formatInOffset(unixSeconds: number, offsetMinutes: number | null, format: DateFormat = 'short'): string {
  const zoned = offsetMinutes !== null;
  const date = new Date((unixSeconds + (zoned ? offsetMinutes * 60 : 0)) * 1000);
  const tz = zoned ? { timeZone: 'UTC' } : {};
  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', ...tz });
  const day = date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric', ...tz });
  switch (format) {
    case 'time':
      return time;
    case 'long':
      return date.toLocaleDateString([], { year: 'numeric', month: 'long', day: 'numeric', ...tz });
    case 'datetime':
      return zoned ? `${day} ${time} ${formatOffset(offsetMinutes).slice(3)}` : `${day} ${time}`;
    default:
      return day;
  }
}

export function formatDelta(deltaSeconds: number): string {
  if (deltaSeconds === 0) return '';
  const sign = deltaSeconds > 0 ? '+' : '-';
  let rest = Math.abs(deltaSeconds);
  const days = Math.floor(rest / 86400);
  rest -= days * 86400;
  const hours = Math.floor(rest / 3600);
  rest -= hours * 3600;
  const minutes = Math.floor(rest / 60);
  const secs = rest - minutes * 60;
  const parts: string[] = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  if (secs && parts.length === 0) parts.push(`${secs}s`);
  return sign + parts.join(' ');
}

export function shiftCommitter(origAuthor: number, origCommitter: number, newAuthor: number): number {
  return origCommitter + (newAuthor - origAuthor);
}

export function authorTimeRange(commits: { author_time: number }[]): { newest: number; oldest: number } | null {
  if (commits.length === 0) return null;
  let newest = commits[0].author_time;
  let oldest = commits[0].author_time;
  for (const c of commits) {
    if (c.author_time > newest) newest = c.author_time;
    if (c.author_time < oldest) oldest = c.author_time;
  }
  return { newest, oldest };
}
