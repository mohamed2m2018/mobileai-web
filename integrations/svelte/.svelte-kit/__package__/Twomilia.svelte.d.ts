import { type TwomiliaConfig } from '@twomilia/web';
interface $$__sveltets_2_IsomorphicComponent<Props extends Record<string, any> = any, Events extends Record<string, any> = any, Slots extends Record<string, any> = any, Exports = {}, Bindings = string> {
    new (options: import('svelte').ComponentConstructorOptions<Props>): import('svelte').SvelteComponent<Props, Events, Slots> & {
        $$bindings?: Bindings;
    } & Exports;
    (internal: unknown, props: Props & {
        $$events?: Events;
        $$slots?: Slots;
    }): Exports & {
        $set?: any;
        $on?: any;
    };
    z_$$bindings?: Bindings;
}
declare const Twomilia: $$__sveltets_2_IsomorphicComponent<{
    /**
       * Twomilia agent config. `analyticsKey` is the only required field;
       * everything else (proxy/server, model, voice, knowledge base, custom
       * tools, widget chrome) defaults to Twomilia Cloud.
       */ config: TwomiliaConfig;
    /** Optional: override the script source (e.g. a self-hosted twomilia.js). */ src?: string | undefined;
}, {
    [evt: string]: CustomEvent<any>;
}, {}, {}, string>;
type Twomilia = InstanceType<typeof Twomilia>;
export default Twomilia;
