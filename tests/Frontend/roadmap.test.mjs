import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const roadmap = await import('../../public/assets/roadmap.js');
const html = await readFile(new URL('../../public/app.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../../frontend/src/app.ts', import.meta.url), 'utf8');
const roadmapUi = await readFile(new URL('../../frontend/src/roadmap-ui.ts', import.meta.url), 'utf8');
const css = await readFile(new URL('../../public/assets/app.css', import.meta.url), 'utf8');
const guestView = await readFile(new URL('../../frontend/src/guest-view.ts', import.meta.url), 'utf8');

const milestone = (overrides = {}) => ({
  due_date: '2026-11-25',
  total_tasks: 6,
  completed_tasks: 2,
  remaining_tasks: 4,
  assigned_team_members: 2,
  tasks_without_team_assignee: 0,
  ...overrides,
});

test('roadmap status uses a missed-deadline label for incomplete overdue milestones', () => {
  assert.equal(roadmap.milestoneStatus(milestone({ due_date: '2026-11-19' }), new Date('2026-11-20T12:00:00Z')).label, 'Missed deadline');
  assert.equal(roadmap.milestoneStatus(milestone({ due_date: '2026-11-19', remaining_tasks: 0, completed_tasks: 6 }), new Date('2026-11-20T12:00:00Z')).label, 'Complete');
});

test('roadmap signals needs attention only for near deadlines with workload indicators', () => {
  const now = new Date('2026-11-20T12:00:00Z');
  assert.equal(roadmap.milestoneStatus(milestone({ due_date: '2026-11-25', remaining_tasks: 4, tasks_without_team_assignee: 1 }), now).label, 'Needs attention');
  assert.equal(roadmap.milestoneStatus(milestone({ due_date: '2026-11-25', remaining_tasks: 5, assigned_team_members: 2 }), now).label, 'Needs attention');
  assert.equal(roadmap.milestoneStatus(milestone({ due_date: '2026-11-25', remaining_tasks: 2, assigned_team_members: 2 }), now).label, 'Due soon');
  assert.equal(roadmap.milestoneStatus(milestone({ due_date: '2026-12-10', remaining_tasks: 8, completed_tasks: 0, assigned_team_members: 1 }), now).label, 'Upcoming');
});

test('roadmap handles milestones without dates, tasks, or completion', () => {
  const now = new Date('2026-11-20T12:00:00Z');
  assert.equal(roadmap.milestoneStatus(milestone({ due_date: null, completed_tasks: 0 }), now).label, 'No deadline');
  assert.equal(roadmap.milestoneStatus(milestone({ due_date: '2026-11-24', total_tasks: 0, completed_tasks: 0, remaining_tasks: 0 }), now).label, 'Due soon');
});

test('roadmap is an internal workspace view with project and task summaries', () => {
  assert.match(html, /id="roadmap-nav"/);
  assert.match(html, /id="roadmap-view"/);
  assert.match(html, /id="roadmap-milestone-list"/);
  assert.match(app, /api<\{ milestones: RoadmapMilestone\[\] \}>\('\/roadmap'\)/);
  assert.match(app, /roadmapUi\.render\(result\.milestones\)/);
  assert.match(guestView, /renderClientView/);
  assert.doesNotMatch(guestView, /Needs attention|Missed deadline/);
});

test('roadmap progress uses the same bar styling as project issue progress', () => {
  assert.match(roadmapUi, /progress\.className = `roadmap-progress/);
  assert.match(css, /#issue-progress, \.guest-progress, \.roadmap-progress\s*\{[^}]*height: 10px/);
  assert.match(css, /#issue-progress::-webkit-progress-value, \.guest-progress::-webkit-progress-value, \.roadmap-progress::-webkit-progress-value\s*\{/);
});
