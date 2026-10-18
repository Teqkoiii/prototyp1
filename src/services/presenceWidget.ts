import { Capacitor } from '@capacitor/core';
import { WidgetBridgePlugin } from 'capacitor-widget-bridge';
import { EMPTY_PRESENCE_STATE, parsePresence, type PresenceState } from './presenceState';

const STORAGE_KEY = 'campusGymPresence';
const STORAGE_GROUP = 'group.de.teqkoiii.campusgym';
const ANDROID_WIDGET_PROVIDER = 'de.teqkoiii.campusgym.PresenceWidgetProvider';
let widgetRegistration: Promise<void> | undefined;
let browserSessionPresence = EMPTY_PRESENCE_STATE;

async function prepareNativeWidget(): Promise<void> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return;
  widgetRegistration ??= WidgetBridgePlugin.setRegisteredWidgets({
    widgets: [ANDROID_WIDGET_PROVIDER],
  }).then(() => undefined);
  await widgetRegistration;
}

export async function getPresenceState(): Promise<PresenceState> {
  if (!Capacitor.isNativePlatform()) {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === null) return browserSessionPresence;
      browserSessionPresence = parsePresence(stored);
      return browserSessionPresence;
    } catch {
      return browserSessionPresence;
    }
  }

  try {
    await prepareNativeWidget();
    const result = await WidgetBridgePlugin.getItem({ key: STORAGE_KEY, group: STORAGE_GROUP });
    return parsePresence(result.results);
  } catch {
    return EMPTY_PRESENCE_STATE;
  }
}

export async function setPresenceState(isPresent: boolean): Promise<PresenceState> {
  const next: PresenceState = {
    isPresent,
    updatedAt: new Date().toISOString(),
    scope: 'this-device-demo',
  };
  const serialized = JSON.stringify(next);

  if (!Capacitor.isNativePlatform()) {
    browserSessionPresence = next;
    try {
      window.localStorage.setItem(STORAGE_KEY, serialized);
    } catch {
      // Keep the status for this browser session if persistent storage is unavailable.
    }
    return next;
  }

  await prepareNativeWidget();
  const result = await WidgetBridgePlugin.setItem({
    key: STORAGE_KEY,
    value: serialized,
    group: STORAGE_GROUP,
  });
  if (!result.results) throw new Error('Presence could not be saved on this device');
  await WidgetBridgePlugin.reloadAllTimelines();
  return next;
}
