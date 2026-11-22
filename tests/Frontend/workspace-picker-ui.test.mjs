import assert from 'node:assert/strict';
import test from 'node:test';
import { initWorkspacePickerUi } from '../../public/assets/workspace-picker-ui.js';

class FakeElement extends EventTarget {
  constructor(id = '', tagName = 'div') {
    super();
    this.id = id;
    this.tagName = tagName;
    this.children = [];
    this.attributes = new Map();
    this.dataset = {};
    this.className = '';
    this.classList = { toggle() {} };
    this.hidden = false;
    this.disabled = false;
    this.open = false;
    this.textContent = '';
    this.tabIndex = -1;
  }

  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = [...children]; }
  showModal() { this.open = true; }
  close() { this.open = false; this.dispatchEvent(new Event('close')); }
  focus() { this.focused = true; }
  querySelectorAll(selector) {
    return selector === '.workspace-picker-option' ? this.children : [];
  }
  matches(selector) { return selector === '.workspace-picker-option' && this.className.includes('workspace-picker-option'); }
}

function keyEvent(key) {
  const event = new Event('keydown', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'key', { value: key });
  return event;
}

test('workspace picker owns selection, confirmation, switching state, and return focus', (t) => {
  const ids = [
    'workspace-switcher', 'workspace-switcher-label', 'workspace-picker', 'workspace-picker-cancel',
    'workspace-picker-confirm', 'workspace-picker-description', 'workspace-picker-options', 'workspace-switch-hint',
    'guest-workspace-switcher', 'guest-workspace-switcher-label',
  ];
  const elements = new Map(ids.map((id) => [`#${id}`, new FakeElement(id, id.endsWith('picker') ? 'dialog' : 'button')]));
  const previousHTMLElement = globalThis.HTMLElement;
  globalThis.HTMLElement = FakeElement;
  const doc = {
    querySelector: (selector) => elements.get(selector) ?? null,
    createElement: (tagName) => new FakeElement('', tagName),
  };
  const workspaces = [{ id: 1, name: 'Current' }, { id: 2, name: 'Next' }];
  const user = { id: 4, name: 'Avery', role: 'admin', workspace_id: 1 };
  const switched = [];
  const ui = initWorkspacePickerUi({
    getWorkspaces: () => workspaces,
    getUser: () => user,
    onSwitch: (workspaceId) => switched.push(workspaceId),
    isCommandPaletteOpen: () => false,
    isShortcutHelpOpen: () => false,
    isIssueStatusPickerOpen: () => false,
    isGuestShellVisible: () => false,
    isWorkspacePanelVisible: () => true,
    doc,
  });
  t.after(() => {
    ui.dispose();
    if (previousHTMLElement === undefined) delete globalThis.HTMLElement;
    else globalThis.HTMLElement = previousHTMLElement;
  });

  ui.renderSwitcher();
  assert.equal(elements.get('#workspace-switcher-label').textContent, 'Current');
  assert.equal(elements.get('#workspace-switcher').disabled, false);
  ui.open(2);
  assert.equal(ui.isOpen(), true);
  assert.equal(ui.pendingWorkspaceId(), 2);
  assert.equal(elements.get('#workspace-picker-confirm').textContent, 'Switch to Next');
  assert.equal(elements.get('#workspace-picker-options').children[1].focused, true);

  const picker = elements.get('#workspace-picker');
  picker.className = 'workspace-picker-option';
  picker.dispatchEvent(keyEvent('ArrowUp'));
  picker.className = '';
  assert.equal(ui.pendingWorkspaceId(), 1);
  assert.equal(elements.get('#workspace-picker-confirm').disabled, true);
  ui.updateSelection(1);
  ui.commit();
  assert.deepEqual(switched, [2]);
  assert.equal(ui.pendingWorkspaceId(), null);
  assert.equal(ui.isOpen(), false);

  ui.setSwitching(true);
  assert.equal(elements.get('#workspace-switcher').disabled, true);
  ui.setSwitching(false, true);
  assert.equal(elements.get('#workspace-switcher').disabled, false);
  assert.equal(elements.get('#workspace-switcher').focused, true);
  ui.setGuestVisible(true);
  assert.equal(elements.get('#guest-workspace-switcher').hidden, false);
  ui.resetSwitcher();
  assert.equal(elements.get('#workspace-switcher-label').textContent, 'Choose workspace');
  assert.equal(elements.get('#guest-workspace-switcher').hidden, true);
});
