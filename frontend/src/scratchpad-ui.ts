import { api, ApiFailure } from './api.js';

interface ScratchpadNote {
  body: string;
  updated_at: string | null;
}

interface ScratchpadUiOptions {
  doc?: Document;
  onUnauthorized: () => void;
}

export function initScratchpadUi(options: ScratchpadUiOptions): {
  open: () => Promise<void>;
  close: (persist?: boolean) => Promise<boolean>;
  isOpen: () => boolean;
  dispose: () => void;
} {
  const doc = options.doc ?? document;
  const dialog = required<HTMLDialogElement>('#scratchpad-dialog');
  const closeButton = required<HTMLButtonElement>('#scratchpad-close');
  const body = required<HTMLTextAreaElement>('#scratchpad-body');
  const status = required<HTMLElement>('#scratchpad-status');
  const listeners = new AbortController();
  let savedBody = '';
  let saving: Promise<boolean> | null = null;
  let editRevision = 0;
  let openRevision = 0;

  function required<T extends Element>(selector: string): T {
    const element = doc.querySelector<T>(selector);
    if (element === null) throw new Error(`Missing scratchpad element: ${selector}`);
    return element;
  }

  function reportError(error: unknown, fallback: string): void {
    if (error instanceof ApiFailure && error.status === 401) {
      options.onUnauthorized();
      return;
    }
    status.textContent = error instanceof Error ? error.message : fallback;
  }

  async function saveCurrent(): Promise<boolean> {
    if (saving !== null) {
      const activeSave = saving;
      const succeeded = await activeSave;
      return succeeded && body.value === savedBody;
    }
    if (body.value === savedBody) return true;

    const currentBody = body.value;
    status.textContent = 'Saving…';
    const request = api<ScratchpadNote>('/scratchpad', {
      method: 'PUT',
      body: JSON.stringify({ body: currentBody }),
    }).then((result) => {
      savedBody = result.body;
      const currentTextWasSaved = body.value === savedBody;
      status.textContent = currentTextWasSaved ? 'Saved.' : 'Unsaved changes';
      return currentTextWasSaved;
    }).catch((error: unknown) => {
      reportError(error, 'Could not save the scratchpad.');
      return false;
    });
    saving = request;
    try {
      return await request;
    } finally {
      if (saving === request) saving = null;
    }
  }

  function markEdited(): void {
    editRevision += 1;
    status.textContent = 'Unsaved changes';
  }

  async function loadNote(revision: number): Promise<void> {
    const revisionAtStart = editRevision;
    const preserveDraft = body.value !== savedBody || saving !== null;
    body.disabled = true;
    status.textContent = 'Loading…';
    try {
      const note = await api<ScratchpadNote>('/scratchpad');
      if (revision !== openRevision) return;
      if (body.value === note.body) {
        savedBody = note.body;
      } else if (!preserveDraft && editRevision === revisionAtStart) {
        savedBody = note.body;
        body.value = note.body;
      }
      status.textContent = body.value === savedBody ? 'Saved.' : 'Unsaved changes';
    } catch (error) {
      if (revision === openRevision) reportError(error, 'Could not load the scratchpad.');
    } finally {
      if (revision === openRevision) body.disabled = false;
    }
  }

  async function open(): Promise<void> {
    if (!dialog.open) dialog.showModal();
    const revision = ++openRevision;
    await loadNote(revision);
    if (revision === openRevision) body.focus();
  }

  async function close(persist = true): Promise<boolean> {
    const revision = ++openRevision;
    const pendingSave = persist && (body.value !== savedBody || saving !== null)
      ? saveCurrent()
      : Promise.resolve(true);
    if (dialog.open) dialog.close();
    const saved = await pendingSave;
    return revision === openRevision && saved;
  }

  closeButton.addEventListener('click', () => { void close(); }, { signal: listeners.signal });
  body.addEventListener('input', markEdited, { signal: listeners.signal });

  return {
    open,
    close,
    isOpen: () => dialog.open,
    dispose: () => {
      listeners.abort();
    },
  };
}
