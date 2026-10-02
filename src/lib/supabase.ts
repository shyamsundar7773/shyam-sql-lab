import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

import { clientEnv, getClientConfigurationStatus } from '@/config/env';

const authStorage = {
  getItem: (key: string) =>
    Platform.OS === 'web' && typeof window === 'undefined'
      ? Promise.resolve(null)
      : AsyncStorage.getItem(key),
  setItem: (key: string, value: string) =>
    Platform.OS === 'web' && typeof window === 'undefined'
      ? Promise.resolve()
      : AsyncStorage.setItem(key, value),
  removeItem: (key: string) =>
    Platform.OS === 'web' && typeof window === 'undefined'
      ? Promise.resolve()
      : AsyncStorage.removeItem(key),
};

const configuration = getClientConfigurationStatus();
const hasValidSupabaseConfiguration =
  configuration.supabaseConfigured &&
  configuration.supabaseUrlFormatValid &&
  configuration.supabasePublishableKeyFormatValid;

export const supabase = hasValidSupabaseConfiguration
  ? createClient(clientEnv.supabaseUrl, clientEnv.supabasePublishableKey, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: false,
        persistSession: true,
        storage: authStorage,
      },
    })
  : null;
