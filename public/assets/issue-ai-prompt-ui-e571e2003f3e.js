import { ApiFailure, api } from './api-c96a28d6bb6c.js';
import { formatIssueMarkdown, formatIssuePrompt } from './issue-export-a772ea268388.js';
export function initIssueAiPromptUi(options) {
    const doc = options.doc ?? document;
    const request = options.request ?? api;
    const issueAiPromptButton = required('#issue-ai-prompt-button');
    const issueAiPromptDialog = required('#issue-ai-prompt-dialog');
    const issueAiPromptCloseButton = required('#issue-ai-prompt-close');
    const issueAiPromptStepCount = required('#issue-ai-prompt-step-count');
    const issueAiPromptContext = required('#issue-ai-prompt-context');
    const issueAiPromptOutcome = required('#issue-ai-prompt-outcome');
    const issueAiPromptCriteria = required('#issue-ai-prompt-criteria');
    const issueAiPromptPreview = required('#issue-ai-prompt-preview');
    const issueAiPromptStatus = required('#issue-ai-prompt-status');
    const issueAiPromptBackButton = required('#issue-ai-prompt-back');
    const issueAiPromptSkipButton = required('#issue-ai-prompt-skip');
    const issueAiPromptNextButton = required('#issue-ai-prompt-next');
    const issueAiPromptActions = required('#issue-ai-prompt-actions');
    const issueAiPromptSaveButton = required('#issue-ai-prompt-save');
    const issueAiPromptCopyButton = required('#issue-ai-prompt-copy');
    const issueAiPromptCopyMarkdownButton = required('#issue-ai-prompt-copy-markdown');
    const issueAiPromptDownloadButton = required('#issue-ai-prompt-download');
    const issueAiPromptSteps = [
        required('#issue-ai-prompt-step-context'),
        required('#issue-ai-prompt-step-outcome'),
        required('#issue-ai-prompt-step-criteria'),
        required('#issue-ai-prompt-step-preview'),
    ];
    const listeners = new AbortController();
    let stepIndex = 0;
    let returnFocus = null;
    function required(selector) {
        const element = doc.querySelector(selector);
        if (element === null)
            throw new Error(`Missing issue AI prompt element: ${selector}`);
        return element;
    }
    function draftIssue(issue) {
        return {
            ...issue,
            context: issueAiPromptContext.value.trim(),
            expected_outcome: issueAiPromptOutcome.value.trim(),
            acceptance_criteria: issueAiPromptCriteria.value.trim(),
        };
    }
    function hasChanges(issue) {
        return issueAiPromptContext.value.trim() !== issue.context
            || issueAiPromptOutcome.value.trim() !== issue.expected_outcome
            || issueAiPromptCriteria.value.trim() !== issue.acceptance_criteria;
    }
    function renderStep() {
        issueAiPromptSteps.forEach((step, index) => { step.hidden = index !== stepIndex; });
        const isPreview = stepIndex === issueAiPromptSteps.length - 1;
        issueAiPromptStepCount.textContent = `Step ${stepIndex + 1} of ${issueAiPromptSteps.length}`;
        issueAiPromptBackButton.hidden = stepIndex === 0;
        issueAiPromptSkipButton.hidden = isPreview;
        issueAiPromptNextButton.hidden = isPreview;
        issueAiPromptActions.hidden = !isPreview;
        const issue = options.getIssue();
        if (isPreview && issue !== null) {
            issueAiPromptPreview.value = formatIssuePrompt(draftIssue(issue));
            issueAiPromptSaveButton.disabled = !hasChanges(issue);
        }
    }
    function updateDraft() {
        const issue = options.getIssue();
        if (issue === null)
            return;
        issueAiPromptStatus.textContent = hasChanges(issue) ? 'Unsaved context changes.' : '';
        issueAiPromptStatus.classList.remove('is-error');
        issueAiPromptSaveButton.disabled = !hasChanges(issue);
        if (stepIndex === issueAiPromptSteps.length - 1)
            renderStep();
    }
    function open() {
        const issue = options.getIssue();
        if (issue === null)
            return;
        const active = doc.activeElement;
        returnFocus = active instanceof HTMLElement ? active : issueAiPromptButton;
        issueAiPromptContext.value = issue.context;
        issueAiPromptOutcome.value = issue.expected_outcome;
        issueAiPromptCriteria.value = issue.acceptance_criteria;
        stepIndex = 0;
        issueAiPromptStatus.textContent = '';
        issueAiPromptStatus.classList.remove('is-error');
        renderStep();
        issueAiPromptDialog.showModal();
        issueAiPromptContext.focus();
    }
    function close() {
        if (issueAiPromptDialog.open)
            issueAiPromptDialog.close();
    }
    async function saveContext() {
        const issue = options.getIssue();
        if (issue === null || !hasChanges(issue))
            return;
        const draft = draftIssue(issue);
        issueAiPromptSaveButton.disabled = true;
        issueAiPromptStatus.classList.remove('is-error');
        issueAiPromptStatus.textContent = 'Saving prompt context…';
        try {
            const result = await request(`/issues/${issue.id}`, {
                method: 'PATCH',
                body: JSON.stringify({
                    context: draft.context,
                    expected_outcome: draft.expected_outcome,
                    acceptance_criteria: draft.acceptance_criteria,
                }),
            });
            if (!options.isIssueCurrent(issue))
                return;
            options.onSaved(result.issue);
            issueAiPromptSaveButton.disabled = true;
            issueAiPromptStatus.textContent = 'Prompt context saved to this issue.';
        }
        catch (error) {
            if (error instanceof ApiFailure && error.status === 401) {
                close();
                options.onUnauthorized();
                return;
            }
            issueAiPromptStatus.classList.add('is-error');
            issueAiPromptStatus.textContent = error instanceof Error ? error.message : 'Could not save prompt context.';
            issueAiPromptSaveButton.disabled = false;
        }
    }
    async function copyPrompt(text, message) {
        try {
            await navigator.clipboard.writeText(text);
            issueAiPromptStatus.classList.remove('is-error');
            issueAiPromptStatus.textContent = message;
        }
        catch {
            issueAiPromptPreview.value = text;
            issueAiPromptPreview.focus();
            issueAiPromptPreview.select();
            issueAiPromptStatus.classList.remove('is-error');
            issueAiPromptStatus.textContent = 'Clipboard unavailable. Export text selected for copying.';
        }
    }
    function downloadMarkdown(issue) {
        const markdown = formatIssueMarkdown(issue);
        const blobUrl = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }));
        const titleSlug = issue.title.toLocaleLowerCase()
            .normalize('NFKD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '')
            .slice(0, 60) || 'issue';
        const download = doc.createElement('a');
        download.href = blobUrl;
        download.download = `issue-${issue.id}-${titleSlug}.md`;
        doc.body.append(download);
        download.click();
        download.remove();
        window.setTimeout(() => URL.revokeObjectURL(blobUrl), 0);
    }
    issueAiPromptButton.addEventListener('click', open, { signal: listeners.signal });
    issueAiPromptCloseButton.addEventListener('click', close, { signal: listeners.signal });
    issueAiPromptDialog.addEventListener('close', () => {
        const target = returnFocus;
        returnFocus = null;
        if (target !== null && target.isConnected && target.closest('[hidden]') === null
            && doc.querySelector('dialog[open]') === null) {
            target.focus();
        }
    }, { signal: listeners.signal });
    issueAiPromptNextButton.addEventListener('click', () => {
        stepIndex = Math.min(stepIndex + 1, issueAiPromptSteps.length - 1);
        renderStep();
        const nextField = [issueAiPromptOutcome, issueAiPromptCriteria, issueAiPromptPreview][stepIndex - 1];
        nextField?.focus();
    }, { signal: listeners.signal });
    issueAiPromptBackButton.addEventListener('click', () => {
        stepIndex = Math.max(stepIndex - 1, 0);
        renderStep();
        [issueAiPromptContext, issueAiPromptOutcome, issueAiPromptCriteria][stepIndex]?.focus();
    }, { signal: listeners.signal });
    issueAiPromptSkipButton.addEventListener('click', () => {
        stepIndex = issueAiPromptSteps.length - 1;
        renderStep();
        issueAiPromptPreview.focus();
    }, { signal: listeners.signal });
    for (const field of [issueAiPromptContext, issueAiPromptOutcome, issueAiPromptCriteria]) {
        field.addEventListener('input', updateDraft, { signal: listeners.signal });
    }
    issueAiPromptSaveButton.addEventListener('click', () => void saveContext(), { signal: listeners.signal });
    issueAiPromptCopyButton.addEventListener('click', () => {
        const issue = options.getIssue();
        if (issue === null)
            return;
        const prompt = formatIssuePrompt(draftIssue(issue));
        issueAiPromptPreview.value = prompt;
        void copyPrompt(prompt, 'Prompt copied.');
    }, { signal: listeners.signal });
    issueAiPromptCopyMarkdownButton.addEventListener('click', () => {
        const issue = options.getIssue();
        if (issue !== null)
            void copyPrompt(formatIssueMarkdown(draftIssue(issue)), 'Markdown copied.');
    }, { signal: listeners.signal });
    issueAiPromptDownloadButton.addEventListener('click', () => {
        const issue = options.getIssue();
        if (issue === null)
            return;
        downloadMarkdown(draftIssue(issue));
        issueAiPromptStatus.classList.remove('is-error');
        issueAiPromptStatus.textContent = 'Markdown downloaded.';
    }, { signal: listeners.signal });
    return {
        isOpen: () => issueAiPromptDialog.open,
        open,
        close,
        dispose: () => listeners.abort(),
    };
}
