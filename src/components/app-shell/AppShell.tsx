import { createContext, useContext, useState } from 'react';
import { SymbolView } from 'expo-symbols';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MobileNavigation } from '@/components/app-shell/MobileNavigation';
import { Sidebar } from '@/components/app-shell/Sidebar';
import { ThemeToggle } from '@/components/app-shell/ThemeToggle';
import { DesignTokens } from '@/constants/theme';
import { useAppTheme } from '@/contexts/theme-context';

type AppShellProps = {
  children: ReactNode;
  mode: 'app' | 'auth' | 'loading' | 'redirecting';
  contentScrollable?: boolean;
};

const AppShellContentScrollableContext = createContext(false);

export function useAppShellContentScrollable() {
  return useContext(AppShellContentScrollableContext);
}

export function AppShell({ children, mode, contentScrollable = true }: AppShellProps) {
  const { width } = useWindowDimensions();
  const { colors } = useAppTheme();
  const isDesktop = width >= DesignTokens.layout.desktopBreakpoint;
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);

  if (mode === 'loading' || mode === 'redirecting') {
    return (
      <AppShellContentScrollableContext.Provider value={false}>
        <View style={[styles.loadingScreen, { backgroundColor: colors.background }]}>
          <View style={styles.hiddenRoute}>{children}</View>
          <ActivityIndicator
            accessibilityLabel={mode === 'loading' ? 'Restoring session' : 'Redirecting'}
            color={colors.primary}
          />
        </View>
      </AppShellContentScrollableContext.Provider>
    );
  }

  if (mode === 'auth') {
    return (
      <AppShellContentScrollableContext.Provider value={false}>
        {children}
      </AppShellContentScrollableContext.Provider>
    );
  }

  return (
    <AppShellContentScrollableContext.Provider value={contentScrollable}>
      <SafeAreaView
        edges={['top', 'left', 'right']}
        style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <View style={[styles.app, { backgroundColor: colors.background }]}>
          {isDesktop ? <Sidebar /> : null}
          <View style={[styles.main, { backgroundColor: colors.background }]}>
            {!isDesktop ? (
              <View
                style={[
                  styles.mobileHeader,
                  { backgroundColor: colors.surface, borderBottomColor: colors.border },
                ]}>
                <Pressable
                  accessibilityLabel="Open navigation menu"
                  accessibilityRole="button"
                  onPress={() => setMobileNavigationOpen(true)}
                  style={({ pressed }) => [styles.menuButton, pressed && styles.pressed]}>
                  <SymbolView
                    name={{ ios: 'line.3.horizontal', android: 'menu', web: 'menu' }}
                    size={23}
                    tintColor={colors.primaryText}
                  />
                </Pressable>
                <View style={styles.mobileBrand}>
                  <View style={[styles.mobileBrandMark, { backgroundColor: colors.primary }]}>
                    <SymbolView
                      name={{ ios: 'externaldrive.fill', android: 'database', web: 'database' }}
                      size={16}
                      tintColor={colors.white}
                    />
                  </View>
                  <Text style={[styles.mobileBrandName, { color: colors.primaryText }]}>
                    Shyam SQL Lab
                  </Text>
                </View>
                <View style={styles.mobileActions}>
                  <ThemeToggle compact />
                  <View style={[styles.mobileAvatar, { backgroundColor: colors.accentSoft }]}>
                    <Text style={[styles.mobileAvatarText, { color: colors.primaryText }]}>S</Text>
                  </View>
                </View>
              </View>
            ) : null}
            {contentScrollable ? (
              <ScrollView
                style={[styles.contentScroll, { backgroundColor: colors.background }]}
                contentContainerStyle={[styles.content, !isDesktop && styles.mobileContent]}
                showsVerticalScrollIndicator={false}>
                <View style={styles.page}>{children}</View>
                <Text style={[styles.footerText, { color: colors.mutedText }]}>
                  Shyam SQL Lab · Your path to SQL confidence
                </Text>
              </ScrollView>
            ) : (
              <View
                style={[
                  styles.fixedContent,
                  !isDesktop && styles.mobileContent,
                  { backgroundColor: colors.background },
                ]}>
                <View style={styles.page}>{children}</View>
              </View>
            )}
          </View>
        </View>
        <MobileNavigation
          visible={mobileNavigationOpen}
          onClose={() => setMobileNavigationOpen(false)}
        />
      </SafeAreaView>
    </AppShellContentScrollableContext.Provider>
  );
}

const styles = StyleSheet.create({
  loadingScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hiddenRoute: {
    display: 'none',
  },
  safeArea: {
    flex: 1,
  },
  app: {
    flex: 1,
    flexDirection: 'row',
  },
  main: {
    flex: 1,
    minWidth: 0,
  },
  mobileHeader: {
    height: 64,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  menuButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.65,
  },
  mobileBrand: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  mobileBrandMark: {
    width: 27,
    height: 27,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mobileBrandName: {
    fontSize: 14,
    fontWeight: '800',
  },
  mobileActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  mobileAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mobileAvatarText: {
    fontSize: 13,
    fontWeight: '800',
  },
  contentScroll: {
    flex: 1,
    minWidth: 0,
  },
  fixedContent: {
    flex: 1,
    minWidth: 0,
    width: '100%',
    maxWidth: DesignTokens.layout.contentMaxWidth,
    alignSelf: 'center',
    paddingHorizontal: 36,
    paddingTop: 36,
    paddingBottom: 24,
  },
  content: {
    width: '100%',
    maxWidth: DesignTokens.layout.contentMaxWidth,
    alignSelf: 'center',
    paddingHorizontal: 36,
    paddingTop: 36,
    paddingBottom: 24,
    flexGrow: 1,
  },
  mobileContent: {
    paddingHorizontal: 18,
    paddingTop: 22,
  },
  page: {
    flex: 1,
    minWidth: 0,
  },
  footerText: {
    fontSize: 11,
    textAlign: 'center',
    paddingTop: 30,
  },
});
