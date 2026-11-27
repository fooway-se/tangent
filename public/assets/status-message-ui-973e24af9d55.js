export function initStatusMessageUi(options) {
    let timer = null;
    function renderLoginTerminal(message, isError = false) {
        const { doc, loginStatusMessage } = options;
        loginStatusMessage.replaceChildren();
        const label = doc.createElement('span');
        label.className = 'login-terminal-label';
        label.textContent = message === '' ? 'READY.' : isError ? 'SIGN-IN FAILED.' : 'NOTICE.';
        const line = doc.createElement('span');
        line.className = 'login-terminal-line';
        const prompt = doc.createElement('span');
        prompt.setAttribute('aria-hidden', 'true');
        prompt.textContent = '>';
        line.append(prompt);
        let text = null;
        if (message === '') {
            const cursor = doc.createElement('span');
            cursor.className = 'login-terminal-cursor';
            cursor.setAttribute('aria-hidden', 'true');
            line.append(cursor);
        }
        else {
            text = doc.createElement('span');
            text.className = 'status-message-text';
            text.textContent = message;
            line.append(text);
        }
        loginStatusMessage.append(label, line);
        return text;
    }
    function report(message, isError = false) {
        if (options.isGuestShellVisible()) {
            options.setGuestStatus(message, isError);
            return;
        }
        if (timer !== null)
            options.clearTimeout(timer);
        timer = null;
        const target = options.workspacePanel.hidden ? options.loginStatusMessage : options.statusMessage;
        if (target === options.statusMessage)
            options.moveWorkspaceStatusToCurrentHeading();
        target.replaceChildren();
        target.classList.toggle('error', isError);
        const text = target === options.loginStatusMessage
            ? renderLoginTerminal(message, isError)
            : message === '' ? null : options.doc.createElement('span');
        if (target !== options.loginStatusMessage && text !== null) {
            text.className = 'status-message-text';
            text.textContent = message;
            target.append(text);
        }
        if (message === '')
            return;
        if (isError) {
            const dismiss = options.doc.createElement('button');
            dismiss.className = 'status-message-dismiss';
            dismiss.type = 'button';
            dismiss.setAttribute('aria-label', 'Dismiss notification');
            dismiss.textContent = '×';
            dismiss.addEventListener('click', () => report(''));
            target.append(dismiss);
        }
        else {
            timer = options.setTimeout(() => {
                if (text !== null && target.contains(text)) {
                    if (target === options.loginStatusMessage)
                        renderLoginTerminal('');
                    else
                        target.replaceChildren();
                    target.classList.remove('error');
                }
                timer = null;
            }, 4_000);
        }
    }
    return { report };
}
