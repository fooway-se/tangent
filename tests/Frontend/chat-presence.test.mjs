import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const app = await readFile(new URL('../../frontend/src/app.ts', import.meta.url), 'utf8');
const css = await readFile(new URL('../../public/assets/app.css', import.meta.url), 'utf8');

test('project chat header places an accessible power light beside the member count', () => {
  assert.match(app, /memberCount\.className = 'chat-members-count'/);
  assert.match(app, /presenceIndicator\.className = 'chat-presence is-unknown'/);
  assert.match(app, /activity\.append\(memberCount, presenceIndicator\)/);
  assert.match(app, /className = 'login-power-light chat-presence-light is-off'/);
  assert.match(app, /presenceIndicator\.setAttribute\('role', 'status'\)/);
  assert.match(css, /\.chat-presence-light\.is-on/);
  assert.match(css, /\.chat-presence-light\.is-off/);
});

test('chat presence sends a heartbeat for the active visible project and uses only a boolean response', () => {
  assert.match(app, /async function pollProjectPresence\(projectId: number/);
  assert.match(app, /\/projects\/\$\{projectId\}\/presence/);
  assert.match(app, /someone_else_viewing\?: boolean/);
  assert.match(app, /PROJECT_PRESENCE_INTERVAL_MS = 15_000/);
  assert.match(app, /if \(document\.hidden\)/);
  assert.match(app, /stopProjectPresencePolling\(\)/);
});
