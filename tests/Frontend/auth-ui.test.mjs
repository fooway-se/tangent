import assert from 'node:assert/strict';
import test from 'node:test';
import { initAuthUi } from '../../public/assets/auth-ui.js';

class FakeElement extends EventTarget {
  constructor() {
    super();
    this.hidden = false;
    this.disabled = false;
    this.required = false;
    this.value = '';
    this.textContent = '';
    this.attributes = new Map();
    this.classList = {
      values: new Set(),
      add: (...names) => names.forEach((name) => this.classList.values.add(name)),
      remove: (...names) => names.forEach((name) => this.classList.values.delete(name)),
    };
  }

  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  reset() {}
  focus() { globalThis.document.activeElement = this; }
  querySelector(selector) { return this.fields?.get(selector) ?? null; }
}

class FakeInput extends FakeElement {}

class FakeForm extends FakeElement {
  constructor(fields = new Map()) {
    super();
    this.fields = fields;
    this.elements = { namedItem: (name) => fields.get(`input[name="${name}"]`) ?? null };
  }
}

function setup(t, request = async () => ({})) {
  const previousDocument = globalThis.document;
  const previousInput = globalThis.HTMLInputElement;
  const password = new FakeInput();
  const confirmation = new FakeInput();
  const verificationCode = new FakeInput();
  const elements = new Map([
    ['#login-form', new FakeForm(new Map([['input[name="email"]', new FakeInput()]]))],
    ['#login-admin-help', new FakeElement()],
    ['.login-keyboard-hints', new FakeElement()],
    ['#login-status-message', new FakeElement()],
    ['#credential-flow', new FakeElement()],
    ['#credential-flow-heading', new FakeElement()],
    ['#credential-flow-description', new FakeElement()],
    ['#credential-flow-error', new FakeElement()],
    ['#credential-form', new FakeForm(new Map([
      ['input[name="password"]', password],
      ['input[name="confirmation"]', confirmation],
      ['input[name="verification_code"]', verificationCode],
    ]))],
    ['#credential-password-fields', new FakeElement()],
    ['#credential-password-label-text', new FakeElement()],
    ['#credential-verification-field', new FakeElement()],
    ['input[name="verification_code"]', verificationCode],
    ['#credential-confirmation-field', new FakeElement()],
    ['#credential-submit', new FakeElement()],
    ['#credential-cancel', new FakeElement()],
  ]);
  const document = {
    activeElement: null,
    querySelector: (selector) => elements.get(selector) ?? null,
  };
  globalThis.document = document;
  globalThis.HTMLInputElement = FakeInput;
  t.after(() => {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
    if (previousInput === undefined) delete globalThis.HTMLInputElement;
    else globalThis.HTMLInputElement = previousInput;
  });
  const replacedUrls = [];
  const ui = initAuthUi({
    onSignedIn() {},
    loadWorkspaces: async () => {},
    loadProjects: async () => {},
    report: (message) => assert.fail(message),
    request,
    doc: document,
    readLocation: () => ({ hash: `#reset=${'a'.repeat(64)}`, pathname: '/app', search: '?source=mail' }),
    replaceUrl: (url) => replacedUrls.push(url),
  });
  return { elements, password, confirmation, replacedUrls, ui };
}

test('password reset links are consumed and open the reset form', async (t) => {
  const { elements, password, confirmation, replacedUrls, ui } = setup(t);

  assert.deepEqual(ui.consumeCredentialFragment(), { type: 'reset', token: 'a'.repeat(64) });
  assert.deepEqual(replacedUrls, ['/app?source=mail']);
  await ui.openCredentialFlow({ type: 'reset', token: 'a'.repeat(64) });

  assert.equal(elements.get('#credential-flow-heading').textContent, 'Choose a new password');
  assert.equal(elements.get('#credential-flow').hidden, false);
  assert.equal(elements.get('#login-form').hidden, true);
  assert.equal(elements.get('#login-status-message').hidden, true);
  assert.equal(elements.get('.login-keyboard-hints').hidden, true);
  assert.equal(elements.get('#credential-password-fields').hidden, false);
  assert.equal(password.required, true);
  assert.equal(password.autocomplete, 'new-password');
  assert.equal(confirmation.required, true);
  assert.equal(elements.get('#credential-form').querySelector('input[name="password"]'), globalThis.document.activeElement);
  ui.dispose();
});

test('invalid invite links leave one visible way back to sign in', async (t) => {
  const { elements, ui } = setup(t, async () => { throw new Error('expired invite'); });

  await ui.openCredentialFlow({ type: 'invite', token: 'a'.repeat(64) });

  assert.equal(elements.get('#credential-flow-description').textContent, 'This invite link cannot be used.');
  assert.equal(elements.get('#credential-flow-error').textContent, 'expired invite');
  assert.equal(elements.get('#credential-submit').hidden, true);
  assert.ok(elements.get('#credential-cancel').classList.values.has('button-primary'));
  ui.dispose();
});
