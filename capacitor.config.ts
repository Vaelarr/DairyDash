import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.ionic.starter',
  appName: 'DairyDash',
  webDir: process.env['CAPACITOR_WEB_DIR'] || 'www'
};

export default config;
