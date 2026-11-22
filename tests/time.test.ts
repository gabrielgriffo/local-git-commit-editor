import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  authorTimeRange,
  formatDelta,
  formatInOffset,
  formatOffset,
  fromWallClock,
  shiftCommitter,
  toWallClock,
} from '../src/app/core/utils/time.ts';

test('toWallClock shows the time in the commit offset, not the machine zone', () => {
  const unix = Date.UTC(2024, 2, 1, 18, 0, 7) / 1000;
  assert.deepEqual(toWallClock(unix, -480), { date: '2024-03-01', time: '10:00', seconds: 7 });
  assert.deepEqual(toWallClock(unix, 330), { date: '2024-03-01', time: '23:30', seconds: 7 });
  assert.deepEqual(toWallClock(unix, 420), { date: '2024-03-02', time: '01:00', seconds: 7 });
});

test('fromWallClock interprets the input in the commit offset', () => {
  const expected = Date.UTC(2024, 2, 1, 17, 0, 7) / 1000;
  assert.equal(fromWallClock('2024-03-01', '09:00', 7, -480), expected);
  assert.equal(fromWallClock('2024-03-01', '22:30', 7, 330), expected);
});

test('fromWallClock round-trips toWallClock', () => {
  for (const offset of [-720, -180, 0, 60, 345, 840]) {
    const unix = 1_700_000_123;
    const w = toWallClock(unix, offset);
    assert.equal(fromWallClock(w.date, w.time, w.seconds, offset), unix);
  }
});

test('fromWallClock rejects invalid input', () => {
  assert.equal(fromWallClock('', '10:00', 0, 0), null);
  assert.equal(fromWallClock('2024-02-30', '10:00', 0, 0), null);
  assert.equal(fromWallClock('2024-03-01', '25:00', 0, 0), null);
  assert.equal(fromWallClock('2024-03-01', '', 0, 0), null);
});

test('formatOffset formats negative, positive and fractional offsets', () => {
  assert.equal(formatOffset(-180), 'UTC-03:00');
  assert.equal(formatOffset(330), 'UTC+05:30');
  assert.equal(formatOffset(0), 'UTC+00:00');
  assert.equal(formatOffset(-570), 'UTC-09:30');
});

test('formatInOffset renders the wall clock of the commit offset', () => {
  const unix = Date.UTC(2024, 2, 1, 18, 0, 0) / 1000;
  const s = formatInOffset(unix, -480, 'datetime');
  assert.match(s, /10:00/);
  assert.match(s, /-08:00$/);
  assert.match(formatInOffset(unix, 420, 'short'), /2/);
});

test('formatDelta keeps every unit instead of rounding to one', () => {
  assert.equal(formatDelta(0), '');
  assert.equal(formatDelta(86400 + 5 * 3600), '+1d 5h');
  assert.equal(formatDelta(-30 * 86400), '-30d');
  assert.equal(formatDelta(45 * 60), '+45m');
  assert.equal(formatDelta(-(2 * 86400 + 3 * 3600 + 15 * 60)), '-2d 3h 15m');
  assert.equal(formatDelta(30), '+30s');
});

test('shiftCommitter preserves the author/committer interval', () => {
  const author = 1_000_000;
  const committer = author + 4 * 86400;
  assert.equal(shiftCommitter(author, committer, author + 86400), committer + 86400);
  assert.equal(shiftCommitter(author, author, author - 60), author - 60);
});

test('authorTimeRange uses min/max regardless of list order', () => {
  assert.equal(authorTimeRange([]), null);
  const commits = [{ author_time: 50 }, { author_time: 300 }, { author_time: 10 }, { author_time: 200 }];
  assert.deepEqual(authorTimeRange(commits), { newest: 300, oldest: 10 });
});
