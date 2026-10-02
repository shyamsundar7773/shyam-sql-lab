import { getClientConfigurationStatus } from '@/config/env';
import { checkApiHealth } from '@/lib/api';
import { supabase } from '@/lib/supabase';

export async function verifyClientIntegration() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Client integration verification is available only in development.');
  }

  const config = getClientConfigurationStatus();
  const apiHealth = config.apiUrlConfigured ? await checkApiHealth() : null;

  return {
    supabaseClientCreated: supabase !== null,
    supabaseConfigured: config.supabaseConfigured,
    apiUrlConfigured: config.apiUrlConfigured,
    apiHealth,
  };
}
