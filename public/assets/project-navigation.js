export class ProjectNavigationOwner {
    navigation = 0;
    session = 0;
    controller = null;
    begin() {
        this.abortRequest();
        this.controller = new AbortController();
        return { navigation: ++this.navigation, session: this.session };
    }
    invalidate() {
        this.navigation++;
        this.abortRequest();
    }
    changeSession() {
        this.session++;
        this.invalidate();
    }
    isCurrent(ticket) {
        return ticket.navigation === this.navigation && ticket.session === this.session;
    }
    signalFor(ticket) {
        return this.isCurrent(ticket) ? this.controller?.signal ?? null : null;
    }
    finish(ticket) {
        if (this.isCurrent(ticket))
            this.controller = null;
    }
    abortRequest() {
        this.controller?.abort();
        this.controller = null;
    }
}
export async function runOwnedRequest(owner, ticket, request, onSuccess, onFailure) {
    const signal = owner.signalFor(ticket);
    if (signal === null)
        return;
    try {
        const result = await request(signal);
        if (owner.isCurrent(ticket))
            onSuccess(result);
    }
    catch (error) {
        if (owner.isCurrent(ticket))
            onFailure(error);
    }
    finally {
        owner.finish(ticket);
    }
}
