import type { ConfigPlugin } from 'expo/config-plugins';
interface PluginOptions {
    /** The source directory to scan for useAction calls. Defaults to 'src' */
    scanDirectory?: string;
    /** App scheme for deep links. Defaults to the scheme in app.json */
    appScheme?: string;
}
declare const withAppIntents: ConfigPlugin<PluginOptions | void>;
export default withAppIntents;
//# sourceMappingURL=withAppIntents.d.ts.map