import { nextMentionSelectionIndex } from './chat-mentions-ccd8a795416a.js';
export function handleMentionKeydown(event, input, list, matches, selectedIndex, setSelectedIndex, selectMember, dismiss) {
    if (list.hidden)
        return false;
    if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        dismiss();
        return true;
    }
    if (matches.length === 0)
        return false;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        event.stopPropagation();
        const nextIndex = nextMentionSelectionIndex(selectedIndex, event.key === 'ArrowDown' ? 1 : -1, matches.length);
        setSelectedIndex(nextIndex);
        const options = Array.from(list.querySelectorAll('[role="option"]'));
        options.forEach((option, index) => option.setAttribute('aria-selected', String(index === nextIndex)));
        const selected = options[nextIndex];
        if (selected !== undefined) {
            input.setAttribute('aria-activedescendant', selected.id);
            selected.scrollIntoView({ block: 'nearest' });
        }
        return true;
    }
    if ((event.key === 'Enter' && !event.shiftKey && !event.isComposing) || event.key === 'Tab') {
        const member = matches[selectedIndex];
        if (member === undefined)
            return false;
        event.preventDefault();
        event.stopPropagation();
        selectMember(member);
        return true;
    }
    return false;
}
