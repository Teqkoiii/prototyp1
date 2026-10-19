# Mobile app

DHBW Gym Hub is packaged as an Android and iOS app with Capacitor. The React interface is shared between both platforms. The dashboard's manual check-in buttons call the Gym Hub API and update shared server occupancy. Set `VITE_GYM_API_BASE_URL` before the native build and configure the API's exact `GYM_APP_ALLOWED_ORIGINS` list for the deployed app origins.

## What the widget does today

The existing native home-screen widget still saves a device-local indicator and updates the widget. It is explicitly labelled as not shared and does not change the common occupancy count. Use the dashboard buttons for shared manual check-in and check-out. Neither path checks DHBW access rights or communicates with a door scanner.

On iOS, interactive widget actions require iOS 17 or newer. The app target itself remains configured for iOS 15; the widget is available on iOS 17 and newer.

## Try it on Android

1. Install Bun and Android Studio, including the Android SDK for API 36.
2. Configure `VITE_GYM_API_BASE_URL` and the server's exact allowed origin list, then run `bun install` and `bun run build && bun x cap sync android`.
3. Run `bun run mobile:android` to open the Android project in Android Studio.
4. Choose a phone or emulator and run the `app` configuration. On the device, add **Gym Hub Check-in** from the home-screen widget picker; its status is local-only.

## Try it on iPhone

1. Use a Mac with Xcode 16 or newer and install Bun.
2. Configure `VITE_GYM_API_BASE_URL` and the server's exact allowed origin list, then run `bun install` and `bun run build && bun x cap sync ios`.
3. Run `bun run mobile:ios` to open the iOS project in Xcode, select a simulator or connected iPhone, and run the **App** scheme.
4. On iOS 17 or newer, add **Gym Hub Check-in** from the home-screen widget gallery; its status is local-only. A physical iPhone requires a valid Apple signing team in Xcode. For device installs and store release, register `group.de.teqkoiii.campusgym` as an App Group for that team and keep it aligned with the entitlements in both targets.

These steps are for local development. Store release still needs platform signing, store listings, a privacy policy, and review. No signing credentials or service secrets belong in this repository.
