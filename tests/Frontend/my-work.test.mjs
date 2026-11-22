import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { groupMyWorkTasks } from '../../public/assets/my-work.js';

const html = await readFile(new URL('../../public/app.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../../frontend/src/app.ts', import.meta.url), 'utf8');
const inboxUi = await readFile(new URL('../../frontend/src/inbox-ui.ts', import.meta.url), 'utf8');
const css = await readFile(new URL('../../public/assets/app.css', import.meta.url), 'utf8');
const inboxEvents = await import('../../public/assets/inbox-events.js');

test('My Work groups assigned tasks by project and milestone, with ungrouped tasks last', () => {
  const tasks = [
    { id: 1, project_id: 2, project_name: 'Beta', milestone_id: 9, milestone_name: 'Next', milestone_due_date: '2027-02-01' },
    { id: 2, project_id: 1, project_name: 'Alpha', milestone_id: null, milestone_name: null },
    { id: 3, project_id: 1, project_name: 'Alpha', milestone_id: 4, milestone_name: 'Soon', milestone_due_date: '2027-01-10' },
    { id: 4, project_id: 1, project_name: 'Alpha', milestone_id: 9, milestone_name: 'Later', milestone_due_date: '2027-02-01' },
    { id: 5, project_id: 1, project_name: 'Alpha', milestone_id: 4, milestone_name: 'Soon', milestone_due_date: '2027-01-10' },
  ];

  const groups = groupMyWorkTasks(tasks);
  assert.deepEqual(groups.map((project) => project.projectName), ['Alpha', 'Beta']);
  assert.deepEqual(groups[0].milestones.map((milestone) => milestone.name), ['Soon', 'Later', 'No milestone']);
  assert.deepEqual(groups[0].milestones.map((milestone) => milestone.tasks.map((task) => task.id)), [[3, 5], [4], [2]]);
  assert.deepEqual(groups[1].milestones.map((milestone) => milestone.tasks.map((task) => task.id)), [[1]]);
});

test('My Work has Inbox and Tasks tabs and keeps task filters separate from inbox filters', () => {
  assert.match(html, /<button[^>]*id="inbox-nav"[^>]*>My Work<\/button>/);
  assert.match(html, /<h1 id="inbox-heading"[^>]*>My Work<\/h1>/);
  assert.match(html, /id="my-work-tab-inbox"[^>]*>Inbox<\/button>/);
  assert.match(html, /id="my-work-tab-inbox"[^>]*aria-selected="true"[^>]*>Inbox<\/button>/);
  assert.match(html, /id="my-work-tab-tasks"[^>]*aria-selected="false"[^>]*>Tasks<\/button>/);
  assert.match(html, /id="my-work-tasks-panel"[^>]*hidden/);
  assert.match(html, /id="my-work-task-groups"/);
  assert.match(inboxUi, /groupMyWorkTasks\(inboxIssues\)/);
  assert.match(inboxUi, /function selectMyWorkTab\(/);
  assert.match(inboxUi, /closest<HTMLDetailsElement>\('\.my-work-task-group'\)\?\.open !== false/);
  assert.deepEqual(inboxEvents.INBOX_TABS.map((tab) => tab.id), ['unread', 'all', 'mentions', 'done']);
  assert.match(css, /\.my-work-tabs\s*\{/);
  assert.match(css, /\.my-work-task-group\s*\{/);
});
