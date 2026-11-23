const CONNECTION_TIMEOUT_MS = 5_000;
const HEARTBEAT_TIMEOUT_MS = 30_000;
const DISCONNECT_GRACE_MS = 5_000;
const RECONNECT_DELAY_MS = 30_000;
const EVENT_SOURCE_CLOSED = 2;
export function initRealtimeTransport(options) {
    const createEventSource = options.eventSourceFactory
        ?? ((url) => new EventSource(url, { withCredentials: true }));
    const setTimeoutFn = options.setTimeout ?? ((callback, delay) => window.setTimeout(callback, delay));
    const clearTimeoutFn = options.clearTimeout ?? ((timer) => window.clearTimeout(timer));
    const connectionTimeoutMs = options.connectionTimeoutMs ?? CONNECTION_TIMEOUT_MS;
    const heartbeatTimeoutMs = options.heartbeatTimeoutMs ?? HEARTBEAT_TIMEOUT_MS;
    const disconnectGraceMs = options.disconnectGraceMs ?? DISCONNECT_GRACE_MS;
    const reconnectDelayMs = options.reconnectDelayMs ?? RECONNECT_DELAY_MS;
    const updateListeners = new Set();
    const connectionListeners = new Set();
    let source = null;
    let connected = false;
    let running = false;
    let connectionTimer = null;
    let heartbeatTimer = null;
    let disconnectTimer = null;
    let reconnectTimer = null;
    function clearTimer(timer) {
        if (timer !== null)
            clearTimeoutFn(timer);
        return null;
    }
    function setConnected(nextConnected) {
        if (connected === nextConnected)
            return;
        connected = nextConnected;
        for (const listener of connectionListeners)
            listener(connected);
    }
    function publishUpdate() {
        for (const listener of updateListeners)
            listener();
    }
    function stopSource() {
        if (source === null)
            return;
        source.close();
        source = null;
    }
    function scheduleReconnect() {
        if (!running || reconnectTimer !== null)
            return;
        reconnectTimer = setTimeoutFn(() => {
            reconnectTimer = null;
            connect();
        }, reconnectDelayMs);
    }
    function usePollingFallback(expectedSource) {
        if (source !== expectedSource || !running)
            return;
        connectionTimer = clearTimer(connectionTimer);
        heartbeatTimer = clearTimer(heartbeatTimer);
        disconnectTimer = clearTimer(disconnectTimer);
        stopSource();
        setConnected(false);
        scheduleReconnect();
    }
    function recordStreamActivity(expectedSource) {
        if (source !== expectedSource || !running)
            return;
        heartbeatTimer = clearTimer(heartbeatTimer);
        disconnectTimer = clearTimer(disconnectTimer);
        heartbeatTimer = setTimeoutFn(() => {
            heartbeatTimer = null;
            usePollingFallback(expectedSource);
        }, heartbeatTimeoutMs);
    }
    function connect() {
        if (!running || source !== null)
            return;
        let nextSource;
        try {
            nextSource = createEventSource(options.url);
        }
        catch {
            scheduleReconnect();
            return;
        }
        source = nextSource;
        connectionTimer = setTimeoutFn(() => {
            connectionTimer = null;
            if (source === nextSource && !connected)
                usePollingFallback(nextSource);
        }, connectionTimeoutMs);
        nextSource.onopen = () => {
            if (source !== nextSource || !running)
                return;
            connectionTimer = clearTimer(connectionTimer);
            disconnectTimer = clearTimer(disconnectTimer);
            reconnectTimer = clearTimer(reconnectTimer);
            setConnected(true);
            recordStreamActivity(nextSource);
        };
        nextSource.onerror = () => {
            if (source !== nextSource || !running)
                return;
            if (nextSource.readyState === EVENT_SOURCE_CLOSED) {
                usePollingFallback(nextSource);
                return;
            }
            if (!connected || disconnectTimer !== null)
                return;
            disconnectTimer = setTimeoutFn(() => {
                disconnectTimer = null;
                usePollingFallback(nextSource);
            }, disconnectGraceMs);
        };
        nextSource.addEventListener('refresh', publishUpdate);
        nextSource.addEventListener('refresh', () => recordStreamActivity(nextSource));
        nextSource.addEventListener('heartbeat', () => recordStreamActivity(nextSource));
    }
    return {
        isConnected: () => connected,
        onUpdate: (listener) => {
            updateListeners.add(listener);
            return () => updateListeners.delete(listener);
        },
        onConnectionChange: (listener) => {
            connectionListeners.add(listener);
            return () => connectionListeners.delete(listener);
        },
        start: () => {
            if (running)
                return;
            running = true;
            connect();
        },
        stop: () => {
            running = false;
            connectionTimer = clearTimer(connectionTimer);
            heartbeatTimer = clearTimer(heartbeatTimer);
            disconnectTimer = clearTimer(disconnectTimer);
            reconnectTimer = clearTimer(reconnectTimer);
            stopSource();
            setConnected(false);
        },
        dispose: () => {
            running = false;
            connectionTimer = clearTimer(connectionTimer);
            heartbeatTimer = clearTimer(heartbeatTimer);
            disconnectTimer = clearTimer(disconnectTimer);
            reconnectTimer = clearTimer(reconnectTimer);
            stopSource();
            setConnected(false);
            updateListeners.clear();
            connectionListeners.clear();
        },
    };
}
