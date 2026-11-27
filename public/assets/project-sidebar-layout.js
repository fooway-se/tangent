export function shouldHideProjectSidebarVent(scrollSize, visibleSize) {
    return visibleSize > 0 && scrollSize > visibleSize + 1;
}
export function getProjectSidebarLayoutStage(overflowsBeforeVent, overflowsAfterVent, projectLinksOverflowAfterCompactButtons) {
    if (!overflowsBeforeVent)
        return 'normal';
    if (!overflowsAfterVent)
        return 'vent-hidden';
    if (!projectLinksOverflowAfterCompactButtons)
        return 'buttons-compact';
    return 'scrollable';
}
