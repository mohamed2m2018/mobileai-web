import React from 'react';
import type { BlockDefinition } from './types';
export declare class BlockRegistry {
    private blocks;
    register(definition: BlockDefinition): void;
    registerMany(definitions: BlockDefinition[]): void;
    unregister(name: string): void;
    clear(): void;
    get(name: string): BlockDefinition | undefined;
    getAll(): BlockDefinition[];
    getForPlacement(placement: 'chat' | 'zone'): BlockDefinition[];
    getAllowed(zoneAllowlist?: BlockDefinition[], placement?: 'chat' | 'zone'): BlockDefinition[];
    validateProps(name: string, props: Record<string, unknown>): {
        valid: boolean;
        errors: string[];
    };
}
export declare const globalBlockRegistry: BlockRegistry;
export declare const BlockRegistryContext: React.Context<BlockRegistry>;
export declare function toBlockDefinition(component: React.ComponentType<any>, defaults?: Partial<Omit<BlockDefinition, 'name' | 'component'>>): BlockDefinition;
//# sourceMappingURL=BlockRegistry.d.ts.map