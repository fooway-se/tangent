export function shouldHideProjectSidebarVent(scrollSize, visibleSize) {
    return visibleSize > 0 && scrollSize > visibleSize + 1;
}
