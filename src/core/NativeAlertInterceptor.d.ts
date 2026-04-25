/**
 * NativeAlertInterceptor — Gray-box interception for React Native Alert dialogs.
 *
 * Pattern: same approach used by Jest/RNTL (jest.spyOn(Alert, 'alert')) and
 * inspired by Detox's gray-box native dialog detection.
 *
 * How it works:
 * 1. install()  — patches Alert.alert / Alert.prompt at agent execution start
 * 2. The patched function STILL calls the original (so the user sees the native alert)
 *    AND captures the metadata (title, message, buttons) into a registry.
 * 3. FiberTreeWalker reads hasActiveAlert() / getActiveAlert() and injects
 *    virtual elements into the dehydrated screen so the LLM can see them.
 * 4. tapTool routes virtual alert element taps to dismissAlert().
 * 5. uninstall() — restores originals at execution end (in finally block).
 *
 * Safety:
 * - Patch is ONLY active while the agent is running.
 * - Original Alert is always restored — even on unhandled errors.
 * - Active alert auto-clears after ALERT_AUTO_CLEAR_MS to prevent stale state.
 */
export interface AlertButton {
    text: string;
    style?: 'default' | 'cancel' | 'destructive';
    /** Original onPress callback from the app */
    onPress?: () => void;
}
export interface ActiveAlert {
    title: string;
    message: string;
    buttons: AlertButton[];
    /** Timestamp when the alert appeared */
    capturedAt: number;
}
/**
 * Install the Alert interceptor.
 * Patches Alert.alert and Alert.prompt — stores originals for restoration.
 * Safe to call multiple times (idempotent).
 */
export declare function installAlertInterceptor(): void;
/**
 * Uninstall the Alert interceptor — restores original Alert methods.
 * Called in the agent's finally block after execution ends.
 */
export declare function uninstallAlertInterceptor(): void;
/** Returns the currently active alert metadata, or null if no alert is showing. */
export declare function getActiveAlert(): ActiveAlert | null;
/** Returns true if a native alert is currently intercepted and active. */
export declare function hasActiveAlert(): boolean;
/**
 * Dismiss the active alert by calling the button's onPress callback.
 * @param buttonIndex - 0-based index of the button to tap
 * @returns true if successfully dismissed, false if no alert or invalid index
 */
export declare function dismissAlert(buttonIndex: number): boolean;
//# sourceMappingURL=NativeAlertInterceptor.d.ts.map