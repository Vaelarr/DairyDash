import { Capacitor } from '@capacitor/core';

export const environment = {
  // Native apps use the deployed API; browsers use their same-origin /api route.
  apiUrl: Capacitor.isNativePlatform() ? 'https://dairy-dash.vercel.app/api' : '/api',
  supabaseUrl: 'https://ntmonicygasxcsvheebn.supabase.co',
  // Publishable keys are safe in the browser. Server secrets belong only in .env.
  supabaseKey: 'sb_publishable_PqGbFV4_zEwdSuaPKEV0fA_2cDmOFSr',
};
