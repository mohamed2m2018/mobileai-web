import type { ReportedIssue } from './types';
export interface ReportedIssueEventSourceOptions {
    url: string;
    onIssueUpdate?: (issue: ReportedIssue) => void;
    onConnected?: () => void;
    onError?: (error: Error) => void;
}
export declare class ReportedIssueEventSource {
    private abortController;
    private intentionalClose;
    private reconnectAttempts;
    private reconnectTimer;
    private readonly maxReconnectAttempts;
    private readonly options;
    constructor(options: ReportedIssueEventSourceOptions);
    connect(): void;
    disconnect(): void;
    private openConnection;
    private readStream;
    private readFullResponse;
    private handleEvent;
    private scheduleReconnect;
}
//# sourceMappingURL=ReportedIssueEventSource.d.ts.map