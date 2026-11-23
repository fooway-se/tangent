import assert from 'node:assert/strict';
import test from 'node:test';
import { createWorkspaceHistory } from '../../public/assets/workspace-history.js';

test('workspace history records only actual location changes and returns locations in reverse order', () => {
  const history = createWorkspaceHistory();
  const projects = { view: 'projects' };
  const inbox = { view: 'inbox' };
  const issueList = { view: 'project', projectId: 5, tab: 'issues' };
  const members = { view: 'project', projectId: 5, tab: 'members' };

  assert.equal(history.record(projects, projects), false);
  assert.equal(history.record(projects, inbox), true);
  assert.equal(history.record(inbox, issueList), true);
  assert.equal(history.record(issueList, members), true);
  assert.deepEqual(history.pop(), issueList);
  assert.deepEqual(history.pop(), inbox);
  assert.deepEqual(history.pop(), projects);
  assert.equal(history.pop(), undefined);
});

test('workspace history treats selected projects and project tabs as distinct locations', () => {
  const history = createWorkspaceHistory();
  assert.equal(history.record({ view: 'projects', focusedProjectId: 4 }, { view: 'projects', focusedProjectId: 8 }), true);
  assert.equal(history.record({ view: 'project', projectId: 4, tab: 'issues' }, { view: 'project', projectId: 4, tab: 'members' }), true);
  assert.deepEqual(history.pop(), { view: 'project', projectId: 4, tab: 'issues' });
  assert.deepEqual(history.pop(), { view: 'projects', focusedProjectId: 4 });
});

test('workspace history clear removes all previous locations', () => {
  const history = createWorkspaceHistory();
  history.record({ view: 'projects' }, { view: 'roadmap' });
  history.clear();
  assert.equal(history.length, 0);
  assert.equal(history.pop(), undefined);
});
