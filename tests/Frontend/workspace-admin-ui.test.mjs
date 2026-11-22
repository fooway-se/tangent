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
  querySelectorAll() { return []; }
  querySelector() { return null; }
  matches() { return false; }
  closest() { return null; }
  focus() { globalThis.document.activeElement = this; }
}

function setup(t) {
  const previousDocument = globalThis.document;
  const ids = [
    'workspace-admin-view', 'workspace-admin-tabs', 'workspace-admin-members-tab',
    'workspace-admin-invites-tab', 'workspace-admin-workspaces-tab',
    'workspace-admin-members-panel', 'workspace-admin-invites-panel',
    'workspace-admin-workspaces-panel', 'workspace-members-list', 'workspace-members-empty',
    'workspace-invites-list', 'workspace-invites-empty', 'invite-form', 'invite-role',
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
  });
  const ui = initWorkspaceAdminUi({
    getUser: () => ({ id: 1, role: 'admin' }),
    isVisible: () => true,
    report: (message) => assert.fail(message),
    request: async () => ({}),
    doc: document,
  });
  return { document, elements, ui };
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
  assert.equal(ui.currentTab(), 'workspaces');
  assert.equal(workspacesTab.attributes.get('aria-selected'), 'true');
  assert.equal(workspacesPanel.hidden, false);
  assert.equal(invitesPanel.hidden, true);
  ui.dispose();
});
