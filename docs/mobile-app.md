# Mobile app

Campus Gym is packaged as an Android and iOS app with Capacitor. The existing React interface is shared between both platforms. Each platform also has a native home-screen widget with **„Ich bin drin“** and **„Ich gehe“** actions.

## What the widget does today

The buttons save a demo check-in on the current phone and update the widget. The app and widget share that device-local status. It is labelled as a demo and does not change the occupancy number, check DHBW access rights, or communicate with a DHBW door scanner. A backend and an agreed data source are needed before the status can represent the number of people in a gym.

On iOS, interactive widget actions require iOS 17 or newer. The app target itself remains configured for iOS 15; the widget is available on iOS 17 and newer.

## Try it on Android

1. Install Bun and Android Studio, including the Android SDK for API 36.
2. From the project folder, run `bun install` and `bun run mobile:sync`.
3. Run `bun run mobile:android` to open the Android project in Android Studio.
4. Choose a phone or emulator and run the `app` configuration. On the device, add **Campus Gym Check-in** from the home-screen widget picker.

## Try it on iPhone

1. Use a Mac with Xcode 16 or newer and install Bun.
2. From the project folder, run `bun install` and `bun run mobile:sync`.
3. Run `bun run mobile:ios` to open the iOS project in Xcode, select a simulator or connected iPhone, and run the **App** scheme.
4. On iOS 17 or newer, add **Campus Gym Check-in** from the home-screen widget gallery. A physical iPhone requires a valid Apple signing team in Xcode. For device installs and store release, register `group.de.teqkoiii.campusgym` as an App Group for that team and keep it aligned with the entitlements in both targets.

These steps are for local development. Store release still needs platform signing, store listings, a privacy policy, and review. No signing credentials or service secrets belong in this repository.
