import assert from 'node:assert/strict';
import test from 'node:test';
import { initWorkspaceAdminUi } from '../../public/assets/workspace-admin-ui.js';

class FakeElement extends EventTarget {
  constructor() {
    super();
    this.children = [];
    this.hidden = false;
    this.disabled = false;
    this.tabIndex = 0;
    this.attributes = new Map();
    this.listeners = new Map();
    this.dataset = {};
    this.children = [];
    this.value = '';
    this.textContent = '';
    this.checked = false;
    this.open = false;
    this.isConnected = true;
    this.classList = {
      toggle() {},
      add() {},
      remove() {},
    };
  }

  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  addEventListener(type, listener, options) {
    const handlers = this.listeners.get(type) ?? [];
    handlers.push(listener);
    this.listeners.set(type, handlers);
    super.addEventListener(type, listener, options);
  }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = [...children]; }
  reset() { this.resetCalled = true; }
  showModal() { this.open = true; }
  close() { this.open = false; }
  click() { this.dispatchEvent(new Event('click', { bubbles: true })); }
  querySelectorAll() { return []; }
  querySelector() { return null; }
  matches() { return false; }
  closest() { return null; }
  focus() { globalThis.document.activeElement = this; }
}

function setup(t, responder = request) {
  const previousDocument = globalThis.document;
  const ids = [
    'workspace-admin-view', 'workspace-admin-tabs', 'workspace-admin-members-tab',
    'workspace-admin-invites-tab', 'workspace-admin-agents-tab', 'workspace-admin-workspaces-tab',
    'workspace-admin-notifications-tab',
    'workspace-admin-members-panel', 'workspace-admin-invites-panel',
    'workspace-admin-agents-panel', 'workspace-admin-workspaces-panel', 'workspace-admin-notifications-panel',
    'workspace-notifications-form', 'workspace-notifications-enabled', 'workspace-notifications-frequency',
    'workspace-notifications-time-zone', 'workspace-notifications-save',
    'workspace-members-list', 'workspace-members-empty',
    'workspace-invites-list', 'workspace-invites-empty', 'invite-form', 'invite-role',
    'workspace-agents-list', 'workspace-agents-empty', 'agent-form', 'agent-name',
    'agent-project-options', 'agent-capability-options', 'agent-expires-in-days',
    'workspace-agent-token-dialog', 'workspace-agent-token-value',
    'workspace-agent-token-copy', 'workspace-agent-token-close',
    'workspace-agent-revoke-dialog', 'workspace-agent-revoke-description',
    'workspace-agent-revoke-cancel', 'workspace-agent-revoke-confirm',
    'invite-project-selection', 'invite-project-options', 'workspace-member-deactivation-dialog',
    'workspace-member-deactivation-description', 'workspace-member-deactivation-cancel',
    'workspace-member-deactivation-confirm', 'workspace-member-role-dialog',
    'workspace-member-role-confirmation-dialog', 'workspace-member-role-heading', 'workspace-member-role-description',
    'workspace-member-role-cancel', 'workspace-member-role-confirm', 'workspace-guest-projects-dialog',
    'workspace-guest-projects-description', 'workspace-guest-project-options',
    'workspace-guest-projects-empty', 'workspace-guest-projects-status',
    'workspace-guest-projects-cancel', 'workspace-guest-projects-save',
  ];
  const elements = new Map(ids.map((id) => [`#${id}`, new FakeElement()]));
  const requests = [];
  const reports = [];
  const previousFormData = globalThis.FormData;
  globalThis.FormData = class {
    constructor(form) { this.values = form.formValues ?? {}; }
    get(name) { return this.values[name] ?? null; }
    getAll(name) {
      const value = this.values[name];
      return Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
    }
  };
  const document = {
    activeElement: null,
    createElement: () => new FakeElement(),
    createTextNode: (text) => ({ textContent: text }),
    querySelector: (selector) => elements.get(selector) ?? null,
  };
  globalThis.document = document;
  t.after(() => {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
    if (previousFormData === undefined) delete globalThis.FormData;
    else globalThis.FormData = previousFormData;
  });
  const ui = initWorkspaceAdminUi({
    getUser: () => ({ id: 1, role: 'admin' }),
    isVisible: () => true,
    report: (message, isError = false) => reports.push({ message, isError }),
    request: async (path, init) => {
      requests.push({ path, init });
      return responder(path, init);
    },
    doc: document,
  });
  return { document, elements, ui, requests, reports };
}

function request(path) {
  if (path === '/users') return Promise.resolve({ users: [] });
  if (path === '/users/invites') return Promise.resolve({ invites: [] });
  if (path === '/projects') return Promise.resolve({ projects: [{ id: 4, name: 'Tangent', status: 'active' }] });
  if (path === '/agents') return Promise.resolve({ agents: [] });
  if (path === '/workspace/notifications') return Promise.resolve({ settings: {
    enabled: false, frequency: 'daily', time_zone: 'UTC', next_send_at: null,
  } });
  return Promise.resolve({});
}

function findByText(element, text) {
  if (element.textContent === text) return element;
  for (const child of element.children ?? []) {
    const match = findByText(child, text);
    if (match !== null) return match;
  }
  return null;
}

test('workspace admin tabs expose one selected panel and support arrow navigation', (t) => {
  const { elements, ui } = setup(t);
  const membersTab = elements.get('#workspace-admin-members-tab');
  const invitesTab = elements.get('#workspace-admin-invites-tab');
  const workspacesTab = elements.get('#workspace-admin-workspaces-tab');
  const membersPanel = elements.get('#workspace-admin-members-panel');
  const invitesPanel = elements.get('#workspace-admin-invites-panel');
  const workspacesPanel = elements.get('#workspace-admin-workspaces-panel');

  ui.switchTab('invites');

  assert.equal(ui.currentTab(), 'invites');
  assert.equal(invitesTab.attributes.get('aria-selected'), 'true');
  assert.equal(invitesTab.tabIndex, 0);
  assert.equal(invitesPanel.hidden, false);
  assert.equal(membersTab.attributes.get('aria-selected'), 'false');
  assert.equal(membersTab.tabIndex, -1);
  assert.equal(membersPanel.hidden, true);

  const rightArrow = {
    target: invitesTab,
    key: 'ArrowRight',
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    defaultPrevented: false,
    preventDefault() { this.defaultPrevented = true; },
    stopPropagation() {},
  };
  const keydownHandler = elements.get('#workspace-admin-tabs').listeners.get('keydown')[0];
  keydownHandler(rightArrow);

  assert.equal(rightArrow.defaultPrevented, true);
  assert.equal(ui.currentTab(), 'agents');
  assert.equal(elements.get('#workspace-admin-agents-tab').attributes.get('aria-selected'), 'true');
  assert.equal(elements.get('#workspace-admin-agents-panel').hidden, false);
  assert.equal(invitesPanel.hidden, true);
  assert.equal(workspacesTab.attributes.get('aria-selected'), 'false');
  assert.equal(workspacesPanel.hidden, true);
  ui.dispose();
});

test('workspace admin shows loading labels instead of empty lists during its first load', async (t) => {
  const resolvers = new Map();
  const state = setup(t, (path) => new Promise((resolve) => { resolvers.set(path, resolve); }));
  const loading = state.ui.load();

  for (const [id, label] of [
    ['#workspace-members-empty', 'Loading members…'],
    ['#workspace-invites-empty', 'Loading invitations…'],
    ['#workspace-agents-empty', 'Loading agents…'],
  ]) {
    assert.equal(state.elements.get(id).hidden, false);
    assert.equal(state.elements.get(id).textContent, label);
  }
  resolvers.get('/users')({ users: [] });
  resolvers.get('/users/invites')({ invites: [] });
  resolvers.get('/projects')({ projects: [] });
  resolvers.get('/agents')({ agents: [] });
  resolvers.get('/workspace/notifications')({ settings: {
    enabled: false, frequency: 'daily', time_zone: 'UTC', next_send_at: null,
  } });
  await loading;

  assert.equal(state.elements.get('#workspace-members-empty').textContent, 'No members yet.');
  assert.equal(state.elements.get('#workspace-invites-empty').textContent, 'No pending invites.');
  assert.equal(state.elements.get('#workspace-agents-empty').textContent, 'No agents yet.');
});

test('workspace admin loads named agents and shows their grants without tokens', async (t) => {
  const agent = {
    id: 9,
    name: 'Build agent',
    is_active: true,
    project_ids: [4],
    capabilities: ['issues.read', 'issues.comment'],
    token_expires_at: '2026-12-23 12:00:00',
    token_last_used_at: null,
  };
  const { elements, requests, ui } = setup(t, async (path) => {
    if (path === '/agents') return { agents: [agent] };
    return request(path);
  });

  await ui.load();
  ui.switchTab('agents');

  assert.equal(ui.currentTab(), 'agents');
  assert.equal(elements.get('#workspace-admin-agents-tab').attributes.get('aria-selected'), 'true');
  assert.equal(elements.get('#workspace-admin-agents-panel').hidden, false);
  assert.equal(requests.some(({ path }) => path === '/agents'), true);
  assert.equal(elements.get('#workspace-agents-list').children.length, 1);
  assert.equal(elements.get('#workspace-agents-list').children[0].children[0].textContent, 'Build agent · Active');
  assert.equal(JSON.stringify(elements.get('#workspace-agents-list').children).includes('secret-token'), false);
});

test('workspace admin creates an agent and displays its token only in the one-time dialog', async (t) => {
  const created = {
    agent: {
      id: 11,
      name: 'Release agent',
      is_active: true,
      project_ids: [4],
      capabilities: ['issues.read', 'issues.status.update'],
      token_expires_at: '2026-12-23 12:00:00',
      token_last_used_at: null,
    },
    token: 'one-time-agent-secret',
    expires_at: '2026-12-23 12:00:00',
  };
  const { elements, requests, reports, ui } = setup(t, async (path, init) => {
    if (path === '/agents' && init?.method === 'POST') return created;
    return request(path);
  });

  await ui.load();
  ui.switchTab('agents');
  const form = elements.get('#agent-form');
  form.formValues = {
    name: 'Release agent',
    project_ids: ['4'],
    capabilities: ['issues.read', 'issues.status.update'],
    expires_in_days: '90',
  };
  form.dispatchEvent(new Event('submit', { cancelable: true }));
  await new Promise((resolve) => setImmediate(resolve));

  const createRequest = requests.find(({ path, init }) => path === '/agents' && init?.method === 'POST');
  assert.deepEqual(JSON.parse(createRequest.init.body), {
    name: 'Release agent',
    project_ids: [4],
    capabilities: ['issues.read', 'issues.status.update'],
    expires_in_days: 90,
  });
  assert.equal(elements.get('#workspace-agent-token-dialog').open, true);
  assert.equal(elements.get('#workspace-agent-token-value').textContent, 'one-time-agent-secret');
  assert.equal(elements.get('#workspace-agents-list').children.some((item) => JSON.stringify(item).includes('one-time-agent-secret')), false);
  assert.equal(reports.at(-1).message, 'Agent created. Copy its token now; Tangent will not show it again.');

  elements.get('#workspace-agent-token-close').click();
  assert.equal(elements.get('#workspace-agent-token-dialog').open, false);
  assert.equal(elements.get('#workspace-agent-token-value').textContent, '');
});

test('workspace admin can load and save only their email notification preferences', async (t) => {
  const saved = { enabled: true, frequency: 'weekly', time_zone: 'Europe/Stockholm', next_send_at: '2026-11-30 08:00:00' };
  const { elements, requests, reports, ui } = setup(t, async (path, init) => {
    if (path === '/workspace/notifications' && init?.method === 'PUT') return { settings: saved };
    return request(path);
  });

  assert.ok(elements.get('#workspace-notifications-time-zone').children.reduce(
    (total, group) => total + (group.children?.length ?? 0), 0) > 100);
  await ui.load();
  ui.switchTab('notifications');

  assert.equal(ui.currentTab(), 'notifications');
  assert.equal(elements.get('#workspace-admin-notifications-tab').attributes.get('aria-selected'), 'true');
  assert.equal(elements.get('#workspace-admin-notifications-panel').hidden, false);
  assert.equal(elements.get('#workspace-notifications-enabled').checked, false);
  assert.equal(elements.get('#workspace-notifications-frequency').value, 'daily');
  assert.equal(elements.get('#workspace-notifications-time-zone').value, 'UTC');
  assert.ok(elements.get('#workspace-notifications-time-zone').children.reduce(
    (total, group) => total + (group.children?.length ?? 0), 0) > 100);
  assert.ok(elements.get('#workspace-notifications-time-zone').children.some((group) =>
    group.children?.some((option) => option.value === 'Europe/Stockholm')));

  elements.get('#workspace-notifications-enabled').checked = true;
  elements.get('#workspace-notifications-frequency').value = 'weekly';
  elements.get('#workspace-notifications-time-zone').value = 'Europe/Stockholm';
  elements.get('#workspace-notifications-form').dispatchEvent(new Event('submit', { cancelable: true }));
  await new Promise((resolve) => setImmediate(resolve));

  const save = requests.find(({ path, init }) => path === '/workspace/notifications' && init?.method === 'PUT');
  assert.deepEqual(JSON.parse(save.init.body), {
    enabled: true,
    frequency: 'weekly',
    time_zone: 'Europe/Stockholm',
  });
  assert.equal(reports.at(-1).message, 'Notification settings saved.');
});

test('workspace notification settings reject a time zone outside the selectable IANA list', async (t) => {
  const { elements, requests, reports, ui } = setup(t);
  await ui.load();
  elements.get('#workspace-notifications-time-zone').value = 'Mars/Phobos';
  elements.get('#workspace-notifications-form').dispatchEvent(new Event('submit', { cancelable: true }));
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(requests.some(({ path, init }) => path === '/workspace/notifications' && init?.method === 'PUT'), false);
  assert.deepEqual(reports.at(-1), { message: 'Choose a time zone from the list.', isError: true });
});

test('workspace admin rotates agent tokens and confirms revocation', async (t) => {
  let agent = {
    id: 9,
    name: 'Build agent',
    is_active: true,
    project_ids: [4],
    capabilities: ['issues.read'],
    token_expires_at: '2026-12-23 12:00:00',
    token_last_used_at: null,
  };
  const { elements, requests, ui } = setup(t, async (path, init) => {
    if (path === '/agents/9/tokens' && init?.method === 'POST') return { token: 'rotated-secret' };
    if (path === '/agents/9' && init?.method === 'DELETE') {
      agent = { ...agent, is_active: false };
      return {};
    }
    if (path === '/agents') return { agents: [agent] };
    return request(path);
  });

  await ui.load();
  ui.switchTab('agents');
  findByText(elements.get('#workspace-agents-list'), 'Rotate token').click();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(elements.get('#workspace-agent-token-value').textContent, 'rotated-secret');
  elements.get('#workspace-agent-token-close').click();

  findByText(elements.get('#workspace-agents-list'), 'Revoke agent').click();
  assert.equal(elements.get('#workspace-agent-revoke-dialog').open, true);
  assert.match(elements.get('#workspace-agent-revoke-description').textContent, /stop working immediately/);
  elements.get('#workspace-agent-revoke-confirm').click();
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(requests.some(({ path, init }) => path === '/agents/9' && init?.method === 'DELETE'), true);
  assert.equal(elements.get('#workspace-agents-list').children[0].children[0].textContent, 'Build agent · Revoked');
});
