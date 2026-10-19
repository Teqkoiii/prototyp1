import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'de.teqkoiii.campusgym',
  appName: 'DHBW Gym Hub',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;
