export function moveFocusWithin(doc, buttons, rowSelector, direction) {
    if (buttons.length === 0)
        return;
    const focused = doc.activeElement;
    const currentIndex = buttons.findIndex((button) => {
        const row = button.closest(rowSelector);
        return row?.classList.contains('is-keyboard-selected') === true
            || (focused instanceof HTMLElement && row?.contains(focused) === true);
    });
    const nextIndex = currentIndex < 0
        ? direction > 0 ? 0 : buttons.length - 1
        : Math.max(0, Math.min(buttons.length - 1, currentIndex + direction));
    for (const button of buttons)
        button.closest(rowSelector)?.classList.remove('is-keyboard-selected');
    const next = buttons[nextIndex];
    next.closest(rowSelector)?.classList.add('is-keyboard-selected');
    next.focus();
}
export function visibleRowsInViewport(items, viewport, rowSelector) {
    const viewportRect = viewport.getBoundingClientRect();
    const viewportTop = viewportRect.top + viewport.clientTop;
    const viewportBottom = viewportTop + viewport.clientHeight;
    return items.filter((item) => {
        const row = item.closest(rowSelector);
        if (row === null)
            return false;
        const rowRect = row.getBoundingClientRect();
        return rowRect.bottom > viewportTop && rowRect.top < viewportBottom;
    }).length;
}
export function moveFocusByPage(doc, buttons, rowSelector, viewport, direction) {
    if (buttons.length === 0)
        return;
    const focused = doc.activeElement;
    const currentIndex = buttons.findIndex((button) => {
        const row = button.closest(rowSelector);
        return row?.classList.contains('is-keyboard-selected') === true
            || (focused instanceof HTMLElement && row?.contains(focused) === true);
    });
    const pageSize = Math.max(1, visibleRowsInViewport(buttons, viewport, rowSelector) - 1);
    const baseIndex = currentIndex < 0
        ? direction > 0 ? 0 : Math.min(pageSize, buttons.length - 1)
        : currentIndex;
    const targetIndex = Math.max(0, Math.min(buttons.length - 1, baseIndex + direction * pageSize));
    for (const button of buttons)
        button.closest(rowSelector)?.classList.remove('is-keyboard-selected');
    const target = buttons[targetIndex];
    if (target === undefined)
        return;
    target.closest(rowSelector)?.classList.add('is-keyboard-selected');
    target.focus();
}
export function moveFocusToBoundary(buttons, rowSelector, edge) {
    if (buttons.length === 0)
        return;
    for (const button of buttons)
        button.closest(rowSelector)?.classList.remove('is-keyboard-selected');
    const target = buttons[edge === 'first' ? 0 : buttons.length - 1];
    target.closest(rowSelector)?.classList.add('is-keyboard-selected');
    target.focus();
}
