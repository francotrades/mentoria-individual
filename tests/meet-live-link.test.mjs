import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Test the exact functions embedded in the student portal, not a rewritten copy.
const html = fs.readFileSync(new URL('../aluno/index.html', import.meta.url), 'utf8');
const start = html.indexOf('function getLiveLinkWindow(');
const end = html.indexOf('function renderSessions()', start);
assert(start >= 0 && end > start, 'Live session functions should exist');
const source = html.slice(start, end);

function fixture(now) {
  class FakeDate extends Date {
    static now() { return Date.parse(now); }
  }
  const context = { Date: FakeDate };
  vm.createContext(context);
  vm.runInContext(source, context);
  return context;
}

const scheduled = {
  teams_url: 'https://meet.google.com/abc-defg-hij',
  data_sessao: '2026-11-05',
  session_time: '14:00:00',
  // Creation date should not affect a scheduled lesson.
  teams_url_added_at: '2026-10-29T17:00:00Z'
};

test('Scheduled Meet access opens 30 minutes early and lasts through a 90-minute lesson', () => {
  const cases = [
    ['2026-11-05T13:29:59-03:00', false],
    ['2026-11-05T13:30:00-03:00', true],
    ['2026-11-05T14:00:00-03:00', true],
    ['2026-11-05T15:30:00-03:00', true],
    ['2026-11-05T16:29:59-03:00', true],
    ['2026-11-05T16:30:00-03:00', false],
    ['2026-11-06T14:00:00-03:00', false]
  ];
  for (const [now, expected] of cases) {
    assert.equal(fixture(now).isLiveLinkAvailable(scheduled), expected, now);
  }
});

test('Existing Teams links without scheduling retain one-hour fallback', () => {
  const session = {
    teams_url: 'https://teams.microsoft.com/example',
    teams_url_added_at: '2026-11-05T14:00:00Z'
  };
  assert.equal(fixture('2026-11-05T14:30:00Z').isLiveLinkAvailable(session), true);
  assert.equal(fixture('2026-11-05T15:00:00Z').isLiveLinkAvailable(session), false);
});

test('Missing live URL or incomplete legacy link is never shown', () => {
  const f = fixture('2026-11-05T14:00:00-03:00');
  assert.equal(f.isLiveLinkAvailable({ ...scheduled, teams_url: null }), false);
  assert.equal(f.isLiveLinkAvailable({ teams_url: 'https://meet.google.com/test' }), false);
});

test('Time-window calculations use Brasilia time rather than viewer local time', () => {
  const f = fixture('2026-11-05T13:30:00-03:00');
  const window = f.getLiveLinkWindow(scheduled);
  assert.equal(window.opensAt.toISOString(), '2026-11-05T16:30:00.000Z');
  assert.equal(window.closesAt.toISOString(), '2026-11-05T19:30:00.000Z');
});
