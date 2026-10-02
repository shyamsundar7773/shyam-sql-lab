export const clientEnv = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() ?? '',
  supabasePublishableKey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ?? '',
  apiUrl: process.env.EXPO_PUBLIC_API_URL?.trim() ?? '',
};

function isValidSupabaseUrl(value: string) {
  try {
    const parsed = new URL(value);
    return (parsed.protocol === 'https:' || parsed.protocol === 'http:') && Boolean(parsed.hostname);
  } catch {
    return false;
  }
}

function isValidSupabasePublishableKey(value: string) {
  return (
    /^sb_publishable_[A-Za-z0-9_-]+$/.test(value) ||
    /^eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)
  );
}

export function getClientConfigurationStatus() {
  const missingVariables = [
    !clientEnv.supabaseUrl && 'EXPO_PUBLIC_SUPABASE_URL',
    !clientEnv.supabasePublishableKey && 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    !clientEnv.apiUrl && 'EXPO_PUBLIC_API_URL',
  ].filter((name): name is string => Boolean(name));

  return {
    supabaseConfigured: Boolean(clientEnv.supabaseUrl && clientEnv.supabasePublishableKey),
    apiUrlConfigured: Boolean(clientEnv.apiUrl),
    supabaseUrlPresent: Boolean(clientEnv.supabaseUrl),
    supabasePublishableKeyPresent: Boolean(clientEnv.supabasePublishableKey),
    supabaseUrlFormatValid: isValidSupabaseUrl(clientEnv.supabaseUrl),
    supabasePublishableKeyFormatValid: isValidSupabasePublishableKey(
      clientEnv.supabasePublishableKey,
    ),
    missingVariables,
  };
}

if (process.env.NODE_ENV === 'development') {
  const {
    missingVariables,
    supabaseUrlPresent,
    supabasePublishableKeyPresent,
    supabaseUrlFormatValid,
    supabasePublishableKeyFormatValid,
  } = getClientConfigurationStatus();

  console.info(
    [
      `SUPABASE_URL_PRESENT: ${supabaseUrlPresent ? 'YES' : 'NO'}`,
      `SUPABASE_PUBLISHABLE_KEY_PRESENT: ${supabasePublishableKeyPresent ? 'YES' : 'NO'}`,
      `SUPABASE_URL_FORMAT_VALID: ${supabaseUrlFormatValid ? 'YES' : 'NO'}`,
      `SUPABASE_PUBLISHABLE_KEY_FORMAT_VALID: ${supabasePublishableKeyFormatValid ? 'YES' : 'NO'}`,
    ].join('\n'),
  );

  if (missingVariables.length > 0) {
    console.error(
      `[Client integration] Missing ${missingVariables.join(', ')}. Copy .env.example to .env and configure the values.`,
    );
  }
}
