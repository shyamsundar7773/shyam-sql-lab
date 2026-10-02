import { SymbolView } from 'expo-symbols';
import { StyleSheet, Text, View } from 'react-native';

import { NavigationLink } from '@/components/app-shell/NavigationLink';
import { ThemeToggle } from '@/components/app-shell/ThemeToggle';
import { navigationItems } from '@/constants/navigation';
import { DesignTokens } from '@/constants/theme';
import { useAppTheme } from '@/contexts/theme-context';

type SidebarProps = {
  onNavigate?: () => void;
};

export function Sidebar({ onNavigate }: SidebarProps) {
  const { colors } = useAppTheme();

  return (
    <View style={[styles.sidebar, { backgroundColor: colors.sidebarBackground }]}>
      <View style={styles.brand}>
        <View style={[styles.brandMark, { backgroundColor: colors.primary }]}>
          <SymbolView
            name={{ ios: 'externaldrive.fill', android: 'database', web: 'database' }}
            size={22}
            tintColor={colors.white}
          />
        </View>
        <View style={styles.brandCopy}>
          <Text style={[styles.brandName, { color: colors.white }]}>Shyam SQL Lab</Text>
          <Text style={[styles.brandTagline, { color: colors.sidebarText }]}>Learn · Practice · Grow</Text>
        </View>
      </View>

      <View style={styles.navSection}>
        <Text style={[styles.navCaption, { color: colors.sidebarCaption }]}>LEARNING SPACE</Text>
        <View style={styles.navList}>
          {navigationItems.slice(0, 5).map((item) => (
            <NavigationLink key={item.href} item={item} onNavigate={onNavigate} />
          ))}
        </View>
      </View>

      <View style={styles.navSection}>
        <Text style={[styles.navCaption, { color: colors.sidebarCaption }]}>YOUR WORKSPACE</Text>
        <View style={styles.navList}>
          {navigationItems.slice(5).map((item) => (
            <NavigationLink key={item.href} item={item} onNavigate={onNavigate} />
          ))}
        </View>
      </View>

      <View style={styles.themeControl}>
        <ThemeToggle />
      </View>
      <View style={styles.sidebarSpacer} />
      <View style={[styles.sidebarFooter, { borderTopColor: colors.sidebarActive }]}>
        <View style={[styles.avatar, { backgroundColor: colors.accentSoft }]}>
          <Text style={[styles.avatarInitials, { color: colors.sidebarBackground }]}>S</Text>
        </View>
        <View style={styles.profileCopy}>
          <Text style={[styles.profileName, { color: colors.white }]}>Learner account</Text>
          <Text style={[styles.profileRole, { color: colors.sidebarText }]}>Your SQL journey</Text>
        </View>
        <SymbolView
          name={{ ios: 'ellipsis', android: 'more_horiz', web: 'more_horiz' }}
          size={20}
          tintColor={colors.sidebarText}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sidebar: {
    width: DesignTokens.layout.sidebarWidth,
    height: '100%',
    paddingHorizontal: 18,
    paddingTop: 26,
    paddingBottom: 16,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 4,
    paddingBottom: 30,
  },
  brandMark: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandCopy: {
    flex: 1,
    gap: 3,
  },
  brandName: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  brandTagline: {
    fontSize: 10,
    fontWeight: '600',
  },
  navSection: {
    marginBottom: 24,
  },
  themeControl: {
    marginTop: 2,
    paddingHorizontal: 4,
  },
  navCaption: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.1,
    marginHorizontal: 14,
    marginBottom: 10,
  },
  navList: {
    gap: 4,
  },
  sidebarSpacer: {
    flex: 1,
    minHeight: 12,
  },
  sidebarFooter: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    borderTopWidth: 1,
    paddingTop: 14,
    paddingHorizontal: 4,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    fontSize: 14,
    fontWeight: '800',
  },
  profileCopy: {
    flex: 1,
    gap: 3,
  },
  profileName: {
    fontSize: 12,
    fontWeight: '700',
  },
  profileRole: {
    fontSize: 10,
  },
});
