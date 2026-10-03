import { SymbolView } from 'expo-symbols';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { NavigationLink } from '@/components/app-shell/NavigationLink';
import { ThemeToggle } from '@/components/app-shell/ThemeToggle';
import { navigationItems } from '@/constants/navigation';
import { DesignTokens } from '@/constants/theme';
import { useAppTheme } from '@/contexts/theme-context';

type SidebarProps = {
  onNavigate?: () => void;
  mobile?: boolean;
};

export function Sidebar({ onNavigate, mobile = false }: SidebarProps) {
  const { colors } = useAppTheme();

  return (
    <View style={[styles.sidebar, mobile && styles.mobileSidebar, { backgroundColor: colors.sidebarBackground }]}>
      <View style={[styles.brand, mobile && styles.mobileBrand]}>
        <View style={[styles.brandMark, { backgroundColor: colors.primary }]}>
          <SymbolView
            name={{ ios: 'externaldrive.fill', android: 'database', web: 'database' }}
            size={22}
            tintColor={colors.white}
          />
        </View>
        <View style={styles.brandCopy}>
          <Text style={[styles.brandName, mobile && styles.mobileBrandName, { color: colors.white }]}>
            Shyam SQL Lab
          </Text>
          <Text style={[styles.brandTagline, mobile && styles.mobileBrandTagline, { color: colors.sidebarText }]}>
            Learn · Practice · Grow
          </Text>
        </View>
      </View>

      {mobile ? (
        <ScrollView
          contentContainerStyle={styles.mobileNavigationContent}
          showsVerticalScrollIndicator={false}
          style={styles.mobileNavigationScroll}>
          <SidebarLinks mobile onNavigate={onNavigate} />
        </ScrollView>
      ) : (
        <>
          <SidebarLinks onNavigate={onNavigate} />
          <View style={styles.sidebarSpacer} />
        </>
      )}
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

function SidebarLinks({
  onNavigate,
  mobile = false,
}: {
  onNavigate?: () => void;
  mobile?: boolean;
}) {
  const { colors } = useAppTheme();
  return (
    <>
      <View style={[styles.navSection, mobile && styles.mobileNavSection]}>
        <Text style={[styles.navCaption, mobile && styles.mobileNavCaption, { color: colors.sidebarCaption }]}>
          LEARNING SPACE
        </Text>
        <View style={[styles.navList, mobile && styles.mobileNavList]}>
          {navigationItems.slice(0, 5).map((item) => (
            <NavigationLink key={item.href} item={item} mobile={mobile} onNavigate={onNavigate} />
          ))}
        </View>
      </View>

      <View style={[styles.navSection, mobile && styles.mobileNavSection]}>
        <Text style={[styles.navCaption, mobile && styles.mobileNavCaption, { color: colors.sidebarCaption }]}>
          YOUR WORKSPACE
        </Text>
        <View style={[styles.navList, mobile && styles.mobileNavList]}>
          {navigationItems.slice(5).map((item) => (
            <NavigationLink key={item.href} item={item} mobile={mobile} onNavigate={onNavigate} />
          ))}
        </View>
      </View>

      <View style={[styles.themeControl, mobile && styles.mobileThemeControl]}>
        <ThemeToggle />
      </View>
    </>
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
  mobileSidebar: {
    width: '100%',
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 12,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 4,
    paddingBottom: 30,
  },
  mobileBrand: {
    paddingHorizontal: 0,
    paddingBottom: 20,
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
  mobileBrandName: {
    fontSize: 18,
  },
  mobileBrandTagline: {
    fontSize: 12,
  },
  navSection: {
    marginBottom: 24,
  },
  mobileNavSection: {
    marginBottom: 18,
  },
  themeControl: {
    marginTop: 2,
    paddingHorizontal: 4,
  },
  mobileThemeControl: {
    marginTop: 4,
    paddingHorizontal: 0,
  },
  navCaption: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.1,
    marginHorizontal: 14,
    marginBottom: 10,
  },
  mobileNavCaption: {
    fontSize: 11,
    marginHorizontal: 10,
    marginBottom: 8,
  },
  navList: {
    gap: 4,
  },
  mobileNavList: {
    gap: 7,
  },
  mobileNavigationScroll: {
    flex: 1,
    minHeight: 0,
  },
  mobileNavigationContent: {
    paddingBottom: 12,
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
