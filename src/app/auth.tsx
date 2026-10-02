import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemeToggle } from '@/components/app-shell/ThemeToggle';
import { Button, Card, ThemedTextInput } from '@/components/ui/primitives';
import { DesignTokens } from '@/constants/theme';
import { useAppTheme } from '@/contexts/theme-context';
import { useAuth } from '@/contexts/auth-context';

type AuthMode = 'login' | 'signup';

export default function AuthScreen() {
  const { colors } = useAppTheme();
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [notice, setNotice] = useState('');
  const isSignup = mode === 'signup';

  const submit = async () => {
    setErrorMessage('');
    setNotice('');

    const normalizedEmail = email.trim();
    if (!normalizedEmail || !password) {
      setErrorMessage('Enter your email and password to continue.');
      return;
    }
    if (isSignup && password !== confirmPassword) {
      setErrorMessage('Your passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      if (isSignup) {
        const result = await signUp(normalizedEmail, password);
        if (result.emailConfirmationRequired) {
          setNotice('Account created. Check your email if confirmation is required before signing in.');
        }
      } else {
        await signIn(normalizedEmail, password);
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'We could not complete your request. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const changeMode = () => {
    setMode(isSignup ? 'login' : 'signup');
    setErrorMessage('');
    setNotice('');
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled">
          <View style={styles.topBar}>
            <View style={styles.brand}>
              <View style={[styles.brandMark, { backgroundColor: colors.primary }]}>
                <SymbolView
                  name={{ ios: 'externaldrive.fill', android: 'database', web: 'database' }}
                  size={19}
                  tintColor={colors.white}
                />
              </View>
              <Text style={[styles.brandName, { color: colors.primaryText }]}>Shyam SQL Lab</Text>
            </View>
            <ThemeToggle compact />
          </View>

          <View style={styles.center}>
            <Card style={styles.card}>
              <Text style={[styles.eyebrow, { color: colors.primary }]}>
                {isSignup ? 'START LEARNING' : 'WELCOME BACK'}
              </Text>
              <Text style={[styles.title, { color: colors.primaryText }]}>
                {isSignup ? 'Create your account' : 'Sign in to your account'}
              </Text>
              <Text style={[styles.subtitle, { color: colors.secondaryText }]}>
                {isSignup
                  ? 'Use your email to get started with Shyam SQL Lab.'
                  : 'Continue to your SQL learning space.'}
              </Text>

              <View style={styles.fields}>
                <Text style={[styles.label, { color: colors.primaryText }]}>Email</Text>
                <ThemedTextInput
                  accessibilityLabel="Email"
                  autoCapitalize="none"
                  autoComplete="email"
                  autoCorrect={false}
                  editable={!submitting}
                  keyboardType="email-address"
                  onChangeText={setEmail}
                  placeholder="you@example.com"
                  returnKeyType="next"
                  textContentType="emailAddress"
                  value={email}
                />

                <Text style={[styles.label, { color: colors.primaryText }]}>Password</Text>
                <ThemedTextInput
                  accessibilityLabel="Password"
                  autoCapitalize="none"
                  autoComplete={isSignup ? 'new-password' : 'current-password'}
                  editable={!submitting}
                  onChangeText={setPassword}
                  placeholder="Enter your password"
                  returnKeyType={isSignup ? 'next' : 'done'}
                  secureTextEntry
                  textContentType={isSignup ? 'newPassword' : 'password'}
                  value={password}
                />

                {isSignup ? (
                  <>
                    <Text style={[styles.label, { color: colors.primaryText }]}>
                      Confirm password
                    </Text>
                    <ThemedTextInput
                      accessibilityLabel="Confirm password"
                      autoCapitalize="none"
                      autoComplete="new-password"
                      editable={!submitting}
                      onChangeText={setConfirmPassword}
                      placeholder="Enter your password again"
                      returnKeyType="done"
                      secureTextEntry
                      textContentType="newPassword"
                      value={confirmPassword}
                    />
                  </>
                ) : null}
              </View>

              {errorMessage ? (
                <Text accessibilityRole="alert" style={[styles.message, { color: colors.danger }]}>
                  {errorMessage}
                </Text>
              ) : null}
              {notice ? (
                <Text style={[styles.message, { color: colors.success }]}>
                  {notice}
                </Text>
              ) : null}

              <Button
                accessibilityLabel={isSignup ? 'Create account' : 'Sign in'}
                disabled={submitting}
                onPress={() => void submit()}
                style={styles.submitButton}>
                {submitting ? (
                  <View style={styles.buttonContent}>
                    <ActivityIndicator color={colors.white} size="small" />
                    <Text style={[styles.submitText, { color: colors.white }]}>
                      {isSignup ? 'Creating account…' : 'Signing in…'}
                    </Text>
                  </View>
                ) : (
                  <Text style={[styles.submitText, { color: colors.white }]}>
                    {isSignup ? 'Create account' : 'Sign in'}
                  </Text>
                )}
              </Button>

              <View style={styles.switchRow}>
                <Text style={[styles.switchText, { color: colors.secondaryText }]}>
                  {isSignup ? 'Already have an account?' : 'New to Shyam SQL Lab?'}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  disabled={submitting}
                  onPress={changeMode}
                  hitSlop={8}>
                  <Text style={[styles.switchAction, { color: colors.primary }]}>
                    {isSignup ? 'Sign in' : 'Create account'}
                  </Text>
                </Pressable>
              </View>
            </Card>
          </View>
          <Text style={[styles.footer, { color: colors.mutedText }]}>
            Learn · Practice · Grow
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 18,
    paddingBottom: 20,
  },
  topBar: {
    width: '100%',
    maxWidth: 1080,
    alignSelf: 'center',
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  brandMark: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandName: {
    fontSize: 15,
    fontWeight: '800',
  },
  center: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 28,
  },
  card: {
    width: '100%',
    maxWidth: 460,
    padding: 28,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.1,
    marginBottom: 10,
  },
  title: {
    fontSize: 25,
    lineHeight: 32,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
    marginBottom: 24,
  },
  fields: {
    gap: 10,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 4,
  },
  message: {
    fontSize: 12,
    lineHeight: 18,
    marginTop: 14,
  },
  submitButton: {
    marginTop: 22,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },
  submitText: {
    fontSize: DesignTokens.typography.body,
    fontWeight: '700',
  },
  switchRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 5,
    marginTop: 20,
  },
  switchText: {
    fontSize: 12,
  },
  switchAction: {
    fontSize: 12,
    fontWeight: '700',
  },
  footer: {
    textAlign: 'center',
    fontSize: 11,
    paddingTop: 12,
  },
});
