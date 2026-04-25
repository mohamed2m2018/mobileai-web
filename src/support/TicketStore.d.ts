/**
 * TicketStore — persists the active support ticket across app restarts.
 *
 * Uses @react-native-async-storage/async-storage as an optional peer dependency.
 * If AsyncStorage is not installed, all methods silently no-op and the feature
 * degrades gracefully (tickets are still shown while the app is open, just not
 * restored after a restart).
 *
 * Usage:
 *   await TicketStore.save(ticketId, analyticsKey);   // on escalation start
 *   const pending = await TicketStore.get();           // on AIAgent mount
 *   await TicketStore.clear();                         // on modal close / ticket closed
 */
interface PendingTicket {
    ticketId: string;
    analyticsKey: string;
}
export declare const TicketStore: {
    /**
     * Persist the active ticket so it survives an app restart.
     */
    save(ticketId: string, analyticsKey: string): Promise<void>;
    /**
     * Retrieve the persisted pending ticket, if any.
     * Returns null if nothing is stored or AsyncStorage is unavailable.
     */
    get(): Promise<PendingTicket | null>;
    /**
     * Remove the stored ticket (ticket closed or user dismissed modal).
     */
    clear(): Promise<void>;
};
export {};
//# sourceMappingURL=TicketStore.d.ts.map