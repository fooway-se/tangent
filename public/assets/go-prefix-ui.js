export function initGoPrefixUi(options) {
    let pending = false;
    let timer = null;
    function clear() {
        pending = false;
        options.hint.hidden = true;
        if (timer !== null)
            options.clearTimeout(timer);
        timer = null;
    }
    function start() {
        clear();
        pending = true;
        const context = options.getContext();
        options.navigationOptions.hidden = context.canNavigateWorkspace === false;
        options.workspaceOption.hidden = context.workspaceCount < 2;
        options.projectOptions.hidden = !context.hasProject || !context.projectVisible;
        options.adminOption.hidden = !context.isAdmin;
        options.roadmapOption.hidden = !context.canUseRoadmap;
        options.hint.hidden = false;
        timer = options.setTimeout(clear, 1200);
    }
    return { isPending: () => pending, clear, start };
}
