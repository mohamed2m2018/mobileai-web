/**
 * ScreenDehydrator — Converts discovered interactive elements into
 * a text representation for the LLM.
 *
 * Output example:
 * ```
 * Screen: Home | Available screens: Home, Menu, Cart
 * Interactive elements:
 * [0]<pressable>🍕 Pizzas</>
 * [1]<pressable>🍔 Burgers</>
 * [2]<pressable>🥤 Drinks</>
 * [3]<pressable>🛒 View Cart</>
 * ```
 */
import type { InteractiveElement, DehydratedScreen, ScreenSnapshot } from './types';
/**
 * Dehydrate the current screen state into a text format for the LLM.
 */
export declare function dehydrateScreen(screenName: string, availableScreens: string[], elementsText: string, elements: InteractiveElement[]): DehydratedScreen;
export declare function dehydrateScreen(snapshot: ScreenSnapshot): DehydratedScreen;
//# sourceMappingURL=ScreenDehydrator.d.ts.map