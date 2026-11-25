import { registerWakeDetector, pickWakeDetector } from './wake-detector.js';
import { AndroidNativeWakeDetector } from './android-native-wake-detector.js';
import { BrowserWakeDetector } from './browser-wake-detector.js';

registerWakeDetector(new AndroidNativeWakeDetector()); // usado só se existir de verdade
registerWakeDetector(new BrowserWakeDetector());
export const wake = pickWakeDetector();
export { allWakeDetectors } from './wake-detector.js';
