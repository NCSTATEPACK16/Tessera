/**
 * The one seam between the web build and the Capacitor shell (v2 spec §7.4).
 *
 * `Capacitor.isNativePlatform()` is read here and nowhere else, so the web path
 * stays the default and every native feature has exactly one switch to find.
 * Native plugins are imported lazily, inside the native branch, so none of them
 * reaches the web bundle's critical path.
 */
import { Capacitor } from '@capacitor/core';

export const isNative: boolean = Capacitor.isNativePlatform();

/** The design doc's §08 parity table — the three moments native adds a haptic to. */
export type HapticMoment = 'pickup' | 'snap' | 'complete';

type HapticsModule = typeof import('@capacitor/haptics');

let hapticsModule: Promise<HapticsModule> | null = null;

function loadHaptics(): Promise<HapticsModule> {
  hapticsModule ??= import('@capacitor/haptics');
  return hapticsModule;
}

/**
 * Fire the haptic for `moment` on native; a no-op on the web.
 *
 * Haptics are an amplifier, never the carrier: every call site already has its
 * visual and audio feedback, so a failed or missing haptic changes nothing the
 * player depends on. Errors are swallowed for the same reason.
 */
export function haptic(moment: HapticMoment): void {
  if (!isNative) return;
  void loadHaptics()
    .then(async ({ Haptics, ImpactStyle, NotificationType }) => {
      switch (moment) {
        case 'pickup':
          await Haptics.impact({ style: ImpactStyle.Light });
          break;
        case 'snap':
          await Haptics.impact({ style: ImpactStyle.Medium });
          break;
        case 'complete':
          // Heavy impact, then the success notification layered under the chord.
          await Haptics.impact({ style: ImpactStyle.Heavy });
          await Haptics.notification({ type: NotificationType.Success });
          break;
      }
    })
    .catch(() => {});
}
