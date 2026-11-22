export interface PaletteCommand {
  label: string;
  detail: string;
  shortcut: string;
  run: () => void;
}

export interface CommandPaletteUiController {
  isPaletteOpen(): boolean;
  isShortcutHelpOpen(): boolean;
  togglePalette(getCommands: () => PaletteCommand[]): void;
  toggleShortcutHelp(): void;
  closePalette(): void;
  closeShortcutHelp(): void;
  dispose(): void;
}

export function initCommandPaletteUi(options: { doc?: Document } = {}): CommandPaletteUiController {
  const doc = options.doc ?? document;
  const commandPalette = required<HTMLDialogElement>('#command-palette');
  const commandPaletteClose = required<HTMLButtonElement>('#command-palette-close');
  const commandSearch = required<HTMLInputElement>('#command-search');
  const commandResults = required<HTMLUListElement>('#command-results');
  const shortcutHelp = required<HTMLDialogElement>('#shortcut-help');
  const shortcutHelpClose = required<HTMLButtonElement>('#shortcut-help-close');
  const listeners = new AbortController();

  let paletteCommands: PaletteCommand[] = [];
  let visibleCommands: PaletteCommand[] = [];
  let activeCommandIndex = 0;

  function required<T extends Element>(selector: string): T {
    const element = doc.querySelector<T>(selector);
    if (element === null) throw new Error(`Missing command palette element: ${selector}`);
    return element;
  }

  function renderResults(): void {
    const query = commandSearch.value.trim().toLocaleLowerCase();
    visibleCommands = paletteCommands.filter((command) =>
      `${command.label} ${command.detail}`.toLocaleLowerCase().includes(query),
    );
    activeCommandIndex = Math.min(activeCommandIndex, Math.max(visibleCommands.length - 1, 0));
    commandResults.replaceChildren();
    if (visibleCommands.length === 0) {
      const empty = doc.createElement('li');
      empty.className = 'command-empty-state';
      empty.textContent = 'No matching commands.';
      commandResults.append(empty);
      return;
    }

    visibleCommands.forEach((command, index) => {
      const item = doc.createElement('li');
      const button = doc.createElement('button');
      button.className = 'command-item';
      button.classList.toggle('is-active', index === activeCommandIndex);
      button.type = 'button';
      button.setAttribute('role', 'option');
      button.setAttribute('aria-selected', String(index === activeCommandIndex));
      button.addEventListener('click', () => runCommand(index), { signal: listeners.signal });
      const label = doc.createElement('span');
      label.textContent = command.label;
      const detail = doc.createElement('span');
      detail.className = 'command-item-description';
      detail.textContent = command.detail;
      button.append(label, detail);
      if (command.shortcut !== '') {
        const shortcut = doc.createElement('kbd');
        shortcut.textContent = command.shortcut;
        button.append(shortcut);
      }
      item.append(button);
      commandResults.append(item);
    });
  }

  function closePalette(): void {
    if (commandPalette.open) commandPalette.close();
  }

  function closeShortcutHelp(): void {
    if (shortcutHelp.open) shortcutHelp.close();
  }

  function runCommand(index: number): void {
    const command = visibleCommands[index];
    if (command === undefined) return;
    closePalette();
    command.run();
  }

  function moveSelection(direction: -1 | 1): void {
    if (visibleCommands.length === 0) return;
    activeCommandIndex = (activeCommandIndex + direction + visibleCommands.length) % visibleCommands.length;
    renderResults();
    commandResults.querySelectorAll<HTMLButtonElement>('.command-item')[activeCommandIndex]?.focus();
  }

  function togglePalette(getCommands: () => PaletteCommand[]): void {
    closeShortcutHelp();
    if (commandPalette.open) {
      closePalette();
      return;
    }
    paletteCommands = getCommands();
    commandSearch.value = '';
    activeCommandIndex = 0;
    renderResults();
    commandPalette.showModal();
    commandSearch.focus();
  }

  function toggleShortcutHelp(): void {
    closePalette();
    if (shortcutHelp.open) {
      closeShortcutHelp();
      return;
    }
    shortcutHelp.showModal();
    shortcutHelpClose.focus();
  }

  commandSearch.addEventListener('input', () => {
    activeCommandIndex = 0;
    renderResults();
  }, { signal: listeners.signal });
  commandPalette.addEventListener('keydown', (event) => {
    const keyboardEvent = event as KeyboardEvent;
    if (keyboardEvent.key === 'ArrowDown' || keyboardEvent.key === 'ArrowUp') {
      keyboardEvent.preventDefault();
      keyboardEvent.stopPropagation();
      moveSelection(keyboardEvent.key === 'ArrowDown' ? 1 : -1);
    } else if (keyboardEvent.key === 'Enter') {
      keyboardEvent.preventDefault();
      keyboardEvent.stopPropagation();
      runCommand(activeCommandIndex);
    }
  }, { signal: listeners.signal });
  commandPaletteClose.addEventListener('click', closePalette, { signal: listeners.signal });
  shortcutHelpClose.addEventListener('click', closeShortcutHelp, { signal: listeners.signal });

  return {
    isPaletteOpen: () => commandPalette.open,
    isShortcutHelpOpen: () => shortcutHelp.open,
    togglePalette,
    toggleShortcutHelp,
    closePalette,
    closeShortcutHelp,
    dispose: () => listeners.abort(),
  };
}
