export interface LogEntry {
    level: 'info' | 'warn' | 'error' | 'debug';
    context: string;
    args: any[];
    timestamp: number;
    message: string;
}
export declare const logger: {
    /** Enable or disable all SDK logging. */
    setEnabled: (value: boolean) => void;
    /** Check if logging is enabled. */
    isEnabled: () => boolean;
    /** Return a snapshot of recent SDK log entries. */
    getEntries: () => LogEntry[];
    /** Return recent entries as plain text lines, newest last. */
    getRecentLines: (limit?: number) => string[];
    /** Extract unflushed entries as plain text and clear the unflushed buffer. */
    extractUnflushedLines: () => string[];
    /** Clear the in-memory SDK log history. */
    clearEntries: () => void;
    info: (context: string, ...args: any[]) => void;
    warn: (context: string, ...args: any[]) => void;
    error: (context: string, ...args: any[]) => void;
    debug: (context: string, ...args: any[]) => void;
};
//# sourceMappingURL=logger.d.ts.map