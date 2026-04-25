/**
 * Persistent device ID — a UUID generated on first launch and stored in AsyncStorage.
 * Unique per app install, survives across sessions.
 *
 * AsyncStorage is an optional peer dependency — if not installed, the ID
 * persists only in memory for the current session.
 */
/**
 * Returns the persistent device ID synchronously (from cache).
 * Returns null if not yet initialized.
 */
export declare function getDeviceId(): string | null;
/**
 * Initializes or retrieves the persistent device ID.
 * Call once on app startup. Subsequent getDeviceId() calls are synchronous.
 */
export declare function initDeviceId(): Promise<string>;
//# sourceMappingURL=device.d.ts.map