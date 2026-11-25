import assert from 'node:assert/strict';
import test from 'node:test';
import { initLoungeChatUi } from '../../public/assets/lounge-chat-ui.js';

class FakeElement extends EventTarget {
  constructor() {
    super();
    this.children = [];
    this.hidden = false;
    this.disabled = false;
    this.value = '';
    this.attributes = new Map();
    this.dataset = {};
    this.scrollTop = 0;
    this.scrollHeight = 0;
    this.clientHeight = 0;
    this.classList = {
      add() {},
      remove() {},
      toggle() {},
    };
  }

  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  removeAttribute(name) { this.attributes.delete(name); }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = [...children]; }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  focus() { globalThis.document.activeElement = this; }
  setSelectionRange() {}
}

function setup(t, requestOverride) {
  const previous = { document: globalThis.document, window: globalThis.window };
  const ids = [
    '#lounge-view', '#lounge-message-list', '#lounge-empty-state', '#lounge-latest-button', '#lounge-form',
    '#lounge-input', '#lounge-mention-suggestions', '#lounge-reply-hint', '#lounge-cancel-reply',
  ];
  const elements = new Map(ids.map((id) => [id, new FakeElement()]));
  const document = {
    activeElement: null,
    hidden: false,
    createElement: () => new FakeElement(),
    createElementNS: () => new FakeElement(),
    createTextNode: (text) => ({ textContent: text }),
    querySelector: (selector) => elements.get(selector) ?? null,
  };
  const timers = new Map();
  let nextTimerId = 0;
  globalThis.document = document;
  globalThis.window = {
    setTimeout(callback, delay) {
      const id = ++nextTimerId;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
  };
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  });
  const paths = [];
  let activeState = false;
  let clearedSelection = 0;
  const ui = initLoungeChatUi({
    isVisible: () => !elements.get('#lounge-view').hidden,
    isDocumentHidden: () => document.hidden,
    getUserId: () => 11,
    onActiveChange(active) { activeState = active; },
    onSelectionCleared() { clearedSelection += 1; },
    selectMessage() {},
    onUnauthorized() { assert.fail('unexpected unauthorized response'); },
    report: (message) => assert.fail(message),
    presence: {
      pollLoungePresence: async () => {},
      stopLoungePolling() {},
      resetLoungeStatus() {},
      setLoungePresenceStatus() {},
    },
    avatarInitials: (name) => name.slice(0, 1),
    compactMessage: (body) => body,
    submitFormOnEnter() {},
    request: async (path) => {
      paths.push(path);
      if (requestOverride !== undefined) return requestOverride(path);
      return path === '/lounge/members' ? { members: [] } : { messages: [] };
    },
    fetcher: async () => ({
      status: 304,
      ok: false,
      headers: { get: () => null },
      json: async () => ({}),
    }),
    doc: document,
  });
  return { activeState: () => activeState, clearedSelection: () => clearedSelection, elements, paths, timers, ui };
}

test('Lounge loading owns its polling state and clears it on navigation away', async (t) => {
  const state = setup(t);

  state.ui.load();
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(state.ui.isActive(), true);
  assert.equal(state.activeState(), true);
  assert.deepEqual(state.paths, ['/lounge/messages', '/lounge/members']);
  assert.equal(state.timers.size, 1);

  state.ui.stop();

  assert.equal(state.ui.isActive(), false);
  assert.equal(state.activeState(), false);
  assert.equal(state.clearedSelection(), 2);
  assert.equal(state.timers.size, 0);
  assert.equal(state.ui.messagesById().size, 0);
  state.ui.dispose();
});

test('Lounge shows loading feedback until its first message request settles', async (t) => {
  let finishMessages;
  let finishMembers;
  const state = setup(t, (path) => path === '/lounge/messages'
    ? new Promise((resolve) => { finishMessages = resolve; })
    : new Promise((resolve) => { finishMembers = resolve; }));

  state.elements.get('#lounge-empty-state').textContent = 'No messages yet.';
  state.ui.load();
  const emptyState = state.elements.get('#lounge-empty-state');
  assert.equal(emptyState.textContent, 'Loading messages…');
  finishMessages({ messages: [] });
  finishMembers({ members: [] });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(emptyState.textContent, 'No messages yet.');
  state.ui.dispose();
});

test('Lounge renders supported smilies as accessible icons and leaves unknown shortcuts as text', async (t) => {
  const message = {
    id: 41,
    channel_id: 0,
    parent_id: null,
    author_id: 11,
    author_name: 'Alex',
    body: "Coffee :coffee and :beer: :pizza :burger :sushi :chinese :) :P :| :o :/ :'( >:( :sick :+1 <3 :lol :think :bug :ship :tada :cool :zzz :eyes :fire :facepalm :tea",
    created_at: '2026-11-25 10:42:00',
  };
  const state = setup(t, (path) => path === '/lounge/messages'
    ? { messages: [message] }
    : { members: [] });

  state.ui.load();
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  const article = state.elements.get('#lounge-message-list').children.find((child) => child.className === 'chat-message');
  const body = article.children.find((child) => child.className === 'chat-message-body');
  const icons = body.children.filter((child) => child.className === 'chat-smiley');
  assert.deepEqual(icons.map((icon) => icon.attributes.get('aria-label')), [
    'coffee', 'beer mug', 'pizza slice', 'burger', 'sushi', 'Chinese takeout', 'smile', 'tongue out',
    'neutral face', 'surprised face', 'uncertain face', 'crying face', 'angry face', 'nauseated face',
    'thumbs up', 'heart', 'laughing face', 'thinking face', 'bug', 'rocket', 'party popper',
    'cool face', 'sleeping face', 'eyes', 'fire', 'facepalm',
  ]);
  assert.equal(icons[0].children[0].attributes.get('viewBox'), '0 0 24 24');
  const smileShapes = icons[6].children[0].children;
  assert.deepEqual(smileShapes.filter((shape) => shape.attributes.get('class') === 'chat-smiley-dot').map((shape) => shape.attributes.get('r')), ['1.35', '1.35']);
  const tongue = icons[7].children[0].children.find((shape) => shape.attributes.get('class') === 'chat-smiley-tongue');
  assert.equal(tongue.attributes.get('d'), 'M9.3 15.4h5.4v3.7a2.7 2.7 0 0 1-5.4 0z');
  const shapeClasses = (icon) => icon.children[0].children.map((shape) => shape.attributes.get('class'));
  assert.ok(shapeClasses(icons[0]).includes('chat-smiley-coffee-surface'));
  assert.ok(shapeClasses(icons[1]).includes('chat-smiley-foam'));
  assert.ok(shapeClasses(icons[1]).includes('chat-smiley-beer-fill'));
  assert.ok(shapeClasses(icons[2]).includes('chat-smiley-pizza-crust'));
  assert.ok(shapeClasses(icons[2]).includes('chat-smiley-pizza-topping'));
  assert.ok(shapeClasses(icons[3]).includes('chat-smiley-lettuce'));
  assert.ok(shapeClasses(icons[3]).includes('chat-smiley-tomato'));
  assert.ok(shapeClasses(icons[11]).includes('chat-smiley-tear'));
  assert.equal(icons[12].attributes.get('aria-label'), 'angry face');
  assert.ok(shapeClasses(icons[13]).includes('chat-smiley-sick'));
  assert.ok(shapeClasses(icons[18]).includes('chat-smiley-nori'));
  assert.ok(shapeClasses(icons[22]).includes('chat-smiley-zzz'));
  assert.ok(shapeClasses(icons[23]).includes('chat-smiley-eyeball'));
  assert.ok(shapeClasses(icons[4]).includes('chat-smiley-fish'));
  assert.ok(shapeClasses(icons[4]).includes('chat-smiley-nori'));
  assert.ok(shapeClasses(icons[5]).includes('chat-smiley-icon-line'));
  assert.ok(shapeClasses(icons[5]).includes('chat-smiley-band'));
  assert.equal(body.children.at(-1).textContent, ' :tea');
  state.ui.dispose();
});

test('Lounge exposes a latest-message control when the transcript is scrolled up', async (t) => {
  const state = setup(t);
  const messageList = state.elements.get('#lounge-message-list');
  const latestButton = state.elements.get('#lounge-latest-button');
  latestButton.hidden = true;

  state.ui.load();
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  messageList.scrollHeight = 900;
  messageList.clientHeight = 240;
  messageList.scrollTop = 0;
  messageList.dispatchEvent(new Event('scroll'));
  assert.equal(latestButton.hidden, false);

  latestButton.dispatchEvent(new Event('click'));
  assert.equal(messageList.scrollTop, 900);
  assert.equal(latestButton.hidden, true);
  state.ui.dispose();
});
