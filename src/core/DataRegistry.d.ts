import type { DataDefinition } from './types';
export declare class DataRegistry {
    private dataSources;
    private listeners;
    register(source: DataDefinition): void;
    unregister(name: string): void;
    get(name: string): DataDefinition | undefined;
    getAll(): DataDefinition[];
    clear(): void;
    onChange(listener: () => void): () => void;
    private notify;
}
export declare const dataRegistry: DataRegistry;
//# sourceMappingURL=DataRegistry.d.ts.map