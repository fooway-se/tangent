export function initGoPrefixUi(options) {
    let pending = false;
    let timer = null;
    function clear() {
        pending = false;
        if (timer !== null)
            options.clearTimeout(timer);
        timer = null;
    }
    function start() {
        clear();
        pending = true;
        timer = options.setTimeout(clear, 1200);
    }
    return { isPending: () => pending, clear, start };
}
