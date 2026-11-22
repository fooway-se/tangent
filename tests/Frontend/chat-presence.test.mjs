import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const app = await readFile(new URL('../../frontend/src/app.ts', import.meta.url), 'utf8');
const projectChatUi = await readFile(new URL('../../frontend/src/project-chat-ui.ts', import.meta.url), 'utf8');
const css = await readFile(new URL('../../public/assets/app.css', import.meta.url), 'utf8');

test('project chat header places an accessible power light beside the member count', () => {
  assert.match(projectChatUi, /memberCount\.className = 'chat-members-count'/);
  assert.match(projectChatUi, /nextPresenceIndicator\.className = 'chat-presence is-unknown'/);
  assert.match(projectChatUi, /activity\.append\(memberCount, nextPresenceIndicator\)/);
  assert.match(projectChatUi, /className = 'login-power-light chat-presence-light is-off'/);
  assert.match(projectChatUi, /nextPresenceIndicator\.setAttribute\('role', 'status'\)/);
  assert.match(css, /\.chat-presence-light\.is-on/);
  assert.match(css, /\.chat-presence-light\.is-off/);
});

test('chat presence sends a heartbeat for the active visible project and uses only a boolean response', () => {
  assert.match(projectChatUi, /async function pollPresence\(projectId: number/);
  assert.match(projectChatUi, /\/projects\/\$\{projectId\}\/presence/);
  assert.match(projectChatUi, /someone_else_viewing\?: boolean/);
  assert.match(projectChatUi, /PROJECT_PRESENCE_INTERVAL_MS = 15_000/);
  assert.match(projectChatUi, /options\.isDocumentHidden\(\)/);
  assert.match(projectChatUi, /function stopPresencePolling\(\)/);
  assert.match(app, /isDocumentHidden: \(\) => document\.hidden/);
});
