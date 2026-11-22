import { ApiFailure, api } from './api.js';
import { generateClientSummary, type ClientSummaryActivity } from './client-summary.js';
import type { ClientView } from './guest-view.js';
import type { Project } from './types.js';

export interface ClientSummaryUi {
  readonly dialog: HTMLDialogElement;
  open(): void;
  close(): void;
  dispose(): void;
}

export function validClientSummaryRange(from: string, to: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return false;
  const fromTime = Date.parse(from + 'T00:00:00Z');
  const toTime = Date.parse(to + 'T00:00:00Z');
  const dayDifference = (toTime - fromTime) / 86_400_000;
  return Number.isFinite(dayDifference) && dayDifference >= 0 && dayDifference <= 365
    && new Date(fromTime).toISOString().slice(0, 10) === from
    && new Date(toTime).toISOString().slice(0, 10) === to;
}

export function initClientSummaryUi(options: {
  getProject: () => Project | null;
  canOpen: () => boolean;
  defaultReturnFocus: () => HTMLElement;
  onUnauthorized: () => void;
}): ClientSummaryUi {
  const dialog = document.querySelector<HTMLDialogElement>('#client-summary-dialog')!;
  const period = document.querySelector<HTMLSelectElement>('#client-summary-period')!;
  const customRange = document.querySelector<HTMLElement>('#client-summary-custom-range')!;
  const fromInput = document.querySelector<HTMLInputElement>('#client-summary-from')!;
  const toInput = document.querySelector<HTMLInputElement>('#client-summary-to')!;
  const generateButton = document.querySelector<HTMLButtonElement>('#client-summary-generate')!;
  const preview = document.querySelector<HTMLTextAreaElement>('#client-summary-preview')!;
  const status = document.querySelector<HTMLElement>('#client-summary-status')!;
  const closeButton = document.querySelector<HTMLButtonElement>('#client-summary-close')!;
  const copyButton = document.querySelector<HTMLButtonElement>('#client-summary-copy')!;
  const listeners = new AbortController();
  let projectId: number | null = null;
  let returnFocus: HTMLElement | null = null;
  let requestVersion = 0;

  function dateInputValue(date: Date): string {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return String(date.getFullYear()) + '-' + month + '-' + day;
  }

  function setPeriod(days: number): void {
    const today = new Date();
    const from = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    from.setDate(from.getDate() - (days - 1));
    fromInput.value = dateInputValue(from);
    toInput.value = dateInputValue(today);
  }

  function open(): void {
    const project = options.getProject();
    if (!options.canOpen() || project === null) return;
    const activeElement = document.activeElement;
    returnFocus = activeElement instanceof HTMLElement && activeElement !== document.body
      ? activeElement
      : options.defaultReturnFocus();
    projectId = project.id;
    period.value = '7';
    customRange.hidden = true;
    setPeriod(7);
    preview.value = '';
    copyButton.disabled = true;
    status.classList.remove('is-error');
    status.textContent = 'Generating summary…';
    generateButton.disabled = false;
    dialog.showModal();
    period.focus();
    void refresh();
  }

  function close(): void {
    if (dialog.open) dialog.close();
  }

  async function refresh(): Promise<void> {
    const selectedProjectId = projectId;
    const from = fromInput.value;
    const to = toInput.value;
    if (selectedProjectId === null) return;
    if (!validClientSummaryRange(from, to)) {
      copyButton.disabled = true;
      status.classList.add('is-error');
      status.textContent = 'Choose a valid date range of no more than 366 days.';
      return;
    }

    const currentRequestVersion = ++requestVersion;
    generateButton.disabled = true;
    copyButton.disabled = true;
    status.classList.remove('is-error');
    status.textContent = 'Generating summary…';
    try {
      const activityPath = '/projects/' + selectedProjectId + '/client-summary-updates?from='
        + encodeURIComponent(from) + '&to=' + encodeURIComponent(to);
      const [view, activity] = await Promise.all([
        api<ClientView>('/projects/' + selectedProjectId + '/client-view'),
        api<ClientSummaryActivity>(activityPath),
      ]);
      if (!dialog.open || currentRequestVersion !== requestVersion || projectId !== selectedProjectId) return;
      preview.value = generateClientSummary(view, activity, from, to);
      copyButton.disabled = preview.value.trim() === '';
      status.textContent = 'Review or edit the summary, then copy it.';
    } catch (error) {
      if (error instanceof ApiFailure && error.status === 401) {
        close();
        options.onUnauthorized();
        return;
      }
      status.classList.add('is-error');
      status.textContent = error instanceof Error ? error.message : 'Could not generate the project summary.';
    } finally {
      if (currentRequestVersion === requestVersion) generateButton.disabled = false;
    }
  }

  async function copy(): Promise<void> {
    const summary = preview.value.trim();
    if (summary === '') return;
    try {
      await navigator.clipboard.writeText(preview.value);
      status.classList.remove('is-error');
      status.textContent = 'Summary copied.';
    } catch {
      preview.focus();
      preview.select();
      status.classList.remove('is-error');
      status.textContent = 'Clipboard unavailable. The summary is selected for copying.';
    }
  }

  period.addEventListener('change', () => {
    customRange.hidden = period.value !== 'custom';
    if (period.value === '7') {
      setPeriod(7);
      void refresh();
    } else if (period.value === '30') {
      setPeriod(30);
      void refresh();
    }
  }, { signal: listeners.signal });
  for (const field of [fromInput, toInput]) {
    field.addEventListener('change', () => {
      if (period.value === 'custom') void refresh();
    }, { signal: listeners.signal });
  }
  generateButton.addEventListener('click', () => { void refresh(); }, { signal: listeners.signal });
  closeButton.addEventListener('click', close, { signal: listeners.signal });
  copyButton.addEventListener('click', () => { void copy(); }, { signal: listeners.signal });
  dialog.addEventListener('close', () => {
    requestVersion += 1;
    projectId = null;
    customRange.hidden = true;
    const target = returnFocus;
    returnFocus = null;
    if (target !== null && target.isConnected && target.closest('[hidden]') === null
      && document.querySelector('dialog[open]') === null) target.focus();
  }, { signal: listeners.signal });

  return { dialog, open, close, dispose: () => listeners.abort() };
}
