import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const app = await readFile(new URL('../../frontend/src/app.ts', import.meta.url), 'utf8');
const projectChatUi = await readFile(new URL('../../frontend/src/project-chat-ui.ts', import.meta.url), 'utf8');
const css = await readFile(new URL('../../public/assets/app.css', import.meta.url), 'utf8');
const html = await readFile(new URL('../../public/app.html', import.meta.url), 'utf8');

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

test('hiding the project chat moves the presence light to the workspace top bar', () => {
  const topbar = html.match(/<header class="workspace-topbar">[\s\S]*?<\/header>/)?.[0] ?? '';
  assert.match(topbar, /id="topbar-presence"[^>]*class="chat-presence is-unknown"[^>]*role="status"[^>]*hidden/);
  assert.match(topbar, /chat-presence-light is-off/);
  assert.match(projectChatUi, /onPresenceChange\?: \(state: PresenceState\) => void/);
  assert.match(app, /onPresenceChange: \(state\) => applyPresenceState\(topbarPresence, state\)/);
  assert.match(app, /topbarPresence\.hidden = projectView\.hidden \|\| projectChatVisible \|\| projectChatUi\.activeProjectId\(\) === null/);
  assert.match(app, /function setProjectChatVisible[\s\S]*?syncTopbarPresence\(\);/);
  assert.match(app, /projectChatColumn\.hidden = view !== 'project' \|\| !projectChatVisible;\s*syncTopbarPresence\(\);/);
  assert.match(app, /chatView\.replaceChildren\(projectChatUi\.create\(projectId\)\);\s*syncTopbarPresence\(\);/);
  assert.match(css, /\.chat-presence\[hidden\]\s*\{\s*display:\s*none;/);
  assert.match(css, /#topbar-presence\s*\{[^}]*margin-left:\s*auto/);
});
