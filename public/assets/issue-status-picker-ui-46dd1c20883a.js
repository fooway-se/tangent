export function initIssueStatusPickerUi(options) {
    const doc = options.doc ?? document;
    const issueStatusPicker = required('#issue-status-picker');
    const issueStatusPickerClose = required('#issue-status-picker-close');
    const issueStatusPickerDescription = required('#issue-status-picker-description');
    const issueStatusPickerOptions = required('#issue-status-picker-options');
    const listeners = new AbortController();
    let selectedIssue = null;
    let returnFocus = null;
    let selectedOptionIndex = 0;
    let visibleOptions = [];
    function required(selector) {
        const element = doc.querySelector(selector);
        if (element === null)
            throw new Error(`Missing issue status picker element: ${selector}`);
        return element;
    }
    function focusOption(index) {
        const buttons = Array.from(issueStatusPickerOptions.querySelectorAll('.issue-status-option'));
        if (buttons.length === 0)
            return;
        selectedOptionIndex = Math.max(0, Math.min(buttons.length - 1, index));
        buttons.forEach((button, buttonIndex) => {
            const active = buttonIndex === selectedOptionIndex;
            button.classList.toggle('is-active', active);
            button.setAttribute('aria-selected', String(active));
            button.tabIndex = active ? 0 : -1;
        });
        buttons[selectedOptionIndex]?.focus();
    }
    async function applySelection() {
        const issue = selectedIssue;
        const status = visibleOptions[selectedOptionIndex]?.value;
        if (issue === null || status === undefined)
            return;
        close();
        if (status !== issue.status)
            await options.onSelect(issue, status);
        if (options.getProjectId() !== issue.project_id)
            return;
        if (!options.isIssueDetailVisible()) {
            if (!options.focusIssueTitle(issue.id))
                options.focusIssuesTab();
        }
        else {
            options.focusIssueDetailStatus();
        }
    }
    function open(issue, trigger) {
        if (issueStatusPicker.open)
            issueStatusPicker.close();
        selectedIssue = issue;
        returnFocus = trigger;
        issueStatusPickerDescription.textContent = `Choose a status for “${issue.title}”. Current status: ${options.statusLabel(issue.status)}.`;
        issueStatusPickerOptions.replaceChildren();
        visibleOptions = options.getOptions(issue);
        selectedOptionIndex = visibleOptions.findIndex((option) => option.value === issue.status);
        visibleOptions.forEach((option, index) => {
            const button = doc.createElement('button');
            button.className = 'button issue-status-option';
            button.type = 'button';
            button.setAttribute('role', 'option');
            button.dataset.status = option.value;
            button.textContent = option.label;
            if (option.value === issue.status) {
                const current = doc.createElement('span');
                current.className = 'issue-status-current';
                current.textContent = 'Current';
                button.append(current);
            }
            button.addEventListener('click', () => {
                focusOption(index);
                void applySelection();
            });
            issueStatusPickerOptions.append(button);
        });
        issueStatusPicker.showModal();
        focusOption(Math.max(0, selectedOptionIndex));
    }
    function close() {
        if (issueStatusPicker.open)
            issueStatusPicker.close();
    }
    issueStatusPickerClose.addEventListener('click', close, { signal: listeners.signal });
    issueStatusPicker.addEventListener('close', () => {
        const target = returnFocus;
        selectedIssue = null;
        returnFocus = null;
        visibleOptions = [];
        if (target !== null && target.isConnected && target.closest('[hidden]') === null && options.shouldRestoreFocus()) {
            target.focus();
        }
    }, { signal: listeners.signal });
    issueStatusPicker.addEventListener('keydown', (event) => {
        if (!(event.target instanceof HTMLElement) || !event.target.matches('.issue-status-option'))
            return;
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            event.stopPropagation();
            focusOption(selectedOptionIndex + (event.key === 'ArrowDown' ? 1 : -1));
        }
        else if (event.key === 'Enter') {
            event.preventDefault();
            event.stopPropagation();
            void applySelection();
        }
    }, { signal: listeners.signal });
    return {
        isOpen: () => issueStatusPicker.open,
        open,
        close,
        createButton(issue) {
            const button = doc.createElement('button');
            button.className = 'button issue-status-button';
            button.type = 'button';
            button.disabled = options.isReadOnly();
            button.setAttribute('aria-haspopup', 'dialog');
            button.setAttribute('aria-label', `Change status for ${issue.title}. Current status: ${options.statusLabel(issue.status)}.`);
            const label = doc.createElement('span');
            label.textContent = options.statusLabel(issue.status);
            const caret = doc.createElement('span');
            caret.className = 'issue-status-caret';
            caret.setAttribute('aria-hidden', 'true');
            caret.textContent = '▾';
            button.append(label, caret);
            button.addEventListener('click', () => open(issue, button));
            return button;
        },
        dispose: () => listeners.abort(),
    };
}
