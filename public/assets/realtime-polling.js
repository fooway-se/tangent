export function shouldUsePolling(realtime) {
    return realtime?.isConnected() !== true;
}
export function bindRealtimePolling(options) {
    const realtime = options.realtime;
    if (realtime === undefined)
        return () => undefined;
    const removeConnectionListener = realtime.onConnectionChange((connected) => {
        if (connected) {
            options.pausePolling();
            if (options.isActive())
                options.refresh();
        }
        else if (options.isActive())
            options.resumePolling();
    });
    const removeUpdateListener = realtime.onUpdate(() => {
        if (realtime.isConnected() && options.isActive())
            options.refresh();
    });
    if (realtime.isConnected()) {
        options.pausePolling();
        if (options.isActive())
            options.refresh();
    }
    return () => {
        removeConnectionListener();
        removeUpdateListener();
    };
}
