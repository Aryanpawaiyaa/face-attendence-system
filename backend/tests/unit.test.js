/* Run with: npm test   (uses the built-in node:test runner) */
process.env.DATABASE_URL = process.env.DATABASE_URL || 'mongodb://127.0.0.1:27017/test';
process.env.JWT_ACCESS_SECRET = 'test-access';
process.env.JWT_REFRESH_SECRET = 'test-refresh';
process.env.APP_TIMEZONE = 'Asia/Kolkata';

const test = require('node:test');
const assert = require('node:assert/strict');
const { localDateOnly, localMinutes, parseHHmm, partsInZone, isoDay, addDays } = require('../src/utils/time');
const { parseCsv } = require('../src/utils/csvParse');

test('localDateOnly follows the institution timezone (IST)', () => {
  // 2026-10-28 20:00 UTC == 2026-10-29 01:30 IST -> local day is the 29th
  assert.equal(isoDay(localDateOnly('2026-10-28T20:00:00Z')), '2026-10-29');
  // 2026-10-29 10:00 UTC == 15:30 IST, same day
  assert.equal(isoDay(localDateOnly('2026-10-29T10:00:00Z')), '2026-10-29');
  // plain dates are kept as calendar dates
  assert.equal(isoDay(localDateOnly('2026-01-05')), '2026-01-05');
});

test('localMinutes / parseHHmm drive the late cut-off', () => {
  assert.equal(localMinutes(new Date('2026-10-29T04:00:00Z')), 9 * 60 + 30); // 09:30 IST
  assert.equal(parseHHmm('10:00'), 600);
  assert.equal(parseHHmm('9:05'), 545);
  assert.equal(parseHHmm('garbage'), 600);
});

test('partsInZone weekday', () => {
  assert.equal(partsInZone(new Date('2026-10-29T06:00:00Z')).weekday, 4); // Thursday
  assert.equal(isoDay(addDays(new Date('2026-12-31T00:00:00Z'), 1)), '2027-01-01');
});

test('parseCsv handles quotes, commas, CRLF and BOM', () => {
  const rows = parseCsv('\uFEFFa,b,c\r\n1,"x, y","say ""hi"""\r\n\r\n2,,z\n');
  assert.deepEqual(rows, [
    ['a', 'b', 'c'],
    ['1', 'x, y', 'say "hi"'],
    ['2', '', 'z'],
  ]);
});
