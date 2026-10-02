import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { PageHeader } from '@/components/PageHeader';
import { PlaceholderScreen } from '@/components/PlaceholderScreen';
import { Button, Card } from '@/components/ui/primitives';
import { useAuth } from '@/contexts/auth-context';
import { useAppTheme } from '@/contexts/theme-context';

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const { colors } = useAppTheme();
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState('');

  if (!user) {
    return (
      <PlaceholderScreen
        title="Profile & Settings"
        description="Profile and application settings will appear here."
        icon={{ ios: 'person.crop.circle', android: 'account_circle', web: 'account_circle' }}
      />
    );
  }

  const handleSignOut = async () => {
    setError('');
    setLoggingOut(true);
    try {
      await signOut();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to sign out. Please try again.');
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <View style={styles.screen}>
      <PageHeader
        eyebrow="YOUR ACCOUNT"
        title="Profile"
        subtitle="Your signed-in account information."
      />
      <Card>
        <Text style={[styles.label, { color: colors.mutedText }]}>EMAIL</Text>
        <Text selectable style={[styles.email, { color: colors.primaryText }]}>
          {user.email ?? 'Email unavailable'}
        </Text>
        {error ? (
          <Text accessibilityRole="alert" style={[styles.error, { color: colors.danger }]}>
            {error}
          </Text>
        ) : null}
        <Button
          accessibilityLabel="Sign out"
          disabled={loggingOut}
          onPress={() => void handleSignOut()}
          style={styles.signOut}>
          {loggingOut ? 'Signing out…' : 'Sign out'}
        </Button>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    gap: 20,
  },
  label: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 7,
  },
  email: {
    fontSize: 15,
    fontWeight: '600',
  },
  error: {
    fontSize: 12,
    marginTop: 12,
  },
  signOut: {
    alignSelf: 'flex-start',
    marginTop: 20,
  },
});
