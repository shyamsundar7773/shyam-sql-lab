import {
  DarkTheme,
  DefaultTheme,
  Redirect,
  Slot,
  ThemeProvider as RouterThemeProvider,
  usePathname,
} from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { AppShell } from '@/components/app-shell/AppShell';
import { AuthProvider, useAuth } from '@/contexts/auth-context';
import { ThemeProvider, useAppTheme } from '@/contexts/theme-context';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ThemeAwareApp />
      </AuthProvider>
    </ThemeProvider>
  );
}

function ThemeAwareApp() {
  const { colors, isDark } = useAppTheme();
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const baseTheme = isDark ? DarkTheme : DefaultTheme;
  const isAuthRoute = pathname === '/auth';
  const isTopicRoute = pathname === '/topic' || pathname.startsWith('/topic/');
  const shellMode = loading
    ? 'loading'
    : user
      ? isAuthRoute
        ? 'redirecting'
        : 'app'
      : isAuthRoute
        ? 'auth'
        : 'redirecting';

  return (
    <RouterThemeProvider
      value={{
        ...baseTheme,
        colors: {
          ...baseTheme.colors,
          background: colors.background,
          card: colors.surface,
          border: colors.border,
          notification: colors.danger,
          primary: colors.primary,
          text: colors.primaryText,
        },
      }}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <>
        {!loading ? <AnimatedSplashOverlay /> : null}
        {!loading && !user && !isAuthRoute ? <Redirect href="/auth" /> : null}
        {!loading && user && isAuthRoute ? <Redirect href="/" /> : null}
        <AppShell mode={shellMode} contentScrollable={!isTopicRoute}>
          <Slot />
        </AppShell>
      </>
    </RouterThemeProvider>
  );
}
