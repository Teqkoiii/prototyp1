import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'de.teqkoiii.campusgym',
  appName: 'Campus Gym',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;
