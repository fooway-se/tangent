export class ProjectNavigationOwner {
    navigation = 0;
    session = 0;
    begin() {
        return { navigation: ++this.navigation, session: this.session };
    }
    invalidate() {
        this.navigation++;
    }
    changeSession() {
        this.session++;
        this.navigation++;
    }
    isCurrent(ticket) {
        return ticket.navigation === this.navigation && ticket.session === this.session;
    }
}
export async function runOwnedRequest(owner, ticket, request, onSuccess, onFailure) {
    try {
        const result = await request();
        if (owner.isCurrent(ticket))
            onSuccess(result);
    }
    catch (error) {
        if (owner.isCurrent(ticket))
            onFailure(error);
    }
}
