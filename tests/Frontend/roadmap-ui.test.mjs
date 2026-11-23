import assert from 'node:assert/strict';
import test from 'node:test';
import { initRoadmapUi } from '../../public/assets/roadmap-ui.js';

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.attributes = new Map();
    this.listeners = new Map();
    this.dataset = {};
    this.className = '';
    this.textContent = '';
    this.hidden = false;
    this.max = 0;
    this.value = 0;
  }

  append(...children) {
    this.children.push(...children);
  }

  replaceChildren(...children) {
    this.children = children;
  }

  setAttribute(name, value) {
    this.attributes.set(name, value);
  }

  addEventListener(name, listener) {
    this.listeners.set(name, listener);
  }
}

function findByClass(root, className) {
  if (root.className?.split(' ').includes(className)) return root;
  for (const child of root.children ?? []) {
    const found = findByClass(child, className);
    if (found !== null) return found;
  }
  return null;
}

function makeMilestone(overrides = {}) {
  return {
    id: 1,
    project_id: 7,
    project_name: 'Tangent',
    project_status: 'active',
    name: 'Winter release',
    due_date: '2026-11-25',
    total_tasks: 6,
    completed_tasks: 2,
    remaining_tasks: 4,
    assigned_team_members: 2,
    tasks_without_team_assignee: 1,
    ...overrides,
  };
}

test('roadmap renders status totals, milestone progress, and accessible project actions', () => {
  const summary = new FakeElement('ul');
  const list = new FakeElement('ul');
  const emptyState = new FakeElement('p');
  const openedProjects = [];
  const ui = initRoadmapUi({
    doc: { createElement: (tag) => new FakeElement(tag) },
    summary,
    milestoneList: list,
    emptyState,
    today: () => new Date('2026-11-20T12:00:00Z'),
    openProject: (projectId) => openedProjects.push(projectId),
  });

  ui.render([
    makeMilestone(),
    makeMilestone({ id: 2, name: 'Finished', due_date: null, completed_tasks: 3, remaining_tasks: 0, total_tasks: 3 }),
  ]);

  assert.equal(emptyState.hidden, true);
  assert.deepEqual(summary.children.map((item) => [item.children[0].textContent, item.children[1].textContent]), [
    ['1', 'Left'], ['1', 'Complete'], ['1', 'Needs attention'], ['0', 'Missed deadline'],
  ]);
  assert.equal(list.children.length, 2);
  assert.equal(list.children[0].dataset.status, 'needs-attention');
  assert.equal(findByClass(list.children[0], 'roadmap-status').textContent, 'Needs attention');
  assert.match(findByClass(list.children[0], 'roadmap-milestone-date').textContent, /^Due /);
  assert.match(findByClass(list.children[0], 'roadmap-milestone-workload').textContent, /4 remaining · 2 team members assigned · 1 task without team assignment/);
  assert.equal(findByClass(list.children[0], 'roadmap-progress').max, 6);
  assert.equal(findByClass(list.children[0], 'roadmap-progress').value, 2);
  assert.match(findByClass(list.children[0], 'roadmap-progress').attributes.get('aria-label'), /2 of 6 tasks complete for Winter release/);

  findByClass(list.children[0], 'roadmap-project-link').listeners.get('click')();
  assert.deepEqual(openedProjects, [7]);
});

test('roadmap shows the empty state and zero summary when there are no milestones', () => {
  const summary = new FakeElement('ul');
  const list = new FakeElement('ul');
  const emptyState = new FakeElement('p');
  const ui = initRoadmapUi({
    doc: { createElement: (tag) => new FakeElement(tag) },
    summary,
    milestoneList: list,
    emptyState,
    today: () => new Date('2026-11-20T12:00:00Z'),
    openProject: () => {},
  });

  ui.render([]);
  assert.equal(emptyState.hidden, false);
  assert.equal(list.children.length, 0);
  assert.deepEqual(summary.children.map((item) => item.children[0].textContent), ['0', '0', '0', '0']);
});
