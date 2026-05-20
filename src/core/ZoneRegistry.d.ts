import React from 'react';
import type { AIZoneConfig, RegisteredZone } from './types';
export declare class ZoneRegistry {
    private zones;
    register(config: AIZoneConfig, ref: React.RefObject<any>): void;
    unregister(id: string): void;
    get(id: string): RegisteredZone | undefined;
    getAll(): RegisteredZone[];
    isActionAllowed(zoneId: string, action: 'highlight' | 'hint' | 'simplify' | 'card' | 'block'): boolean;
}
export declare const globalZoneRegistry: ZoneRegistry;
export declare const ZoneRegistryContext: React.Context<ZoneRegistry>;
//# sourceMappingURL=ZoneRegistry.d.ts.map