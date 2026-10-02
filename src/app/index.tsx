import { Link } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { PageHeader } from '@/components/PageHeader';
import {
  Badge,
  Button,
  Card,
  ProgressIndicator,
  SectionHeader,
} from '@/components/ui/primitives';
import { dashboardMockData } from '@/data/dashboardMockData';
import { DesignTokens, SemanticElevation, type AppTheme } from '@/constants/theme';
import { useAppTheme } from '@/contexts/theme-context';

type DashboardStatTone = (typeof dashboardMockData.stats)[number]['tone'];

type DashboardStyles = ReturnType<typeof createDashboardStyles>;

function DashboardAction({
  href,
  label,
  colors,
  styles,
}: {
  href: '/learning-path' | '/sql-practice';
  label: string;
  colors: ReturnType<typeof import('@/constants/theme').getThemeColors>;
  styles: DashboardStyles;
}) {
  return (
    <Link href={href} asChild>
      <Button style={styles.actionButton} accessibilityRole="link">
        <Text style={styles.actionButtonText}>{label}</Text>
        <SymbolView
          name={{ ios: 'arrow.right', android: 'arrow_forward', web: 'arrow_forward' }}
          size={16}
          tintColor={colors.white}
        />
      </Button>
    </Link>
  );
}

export default function DashboardScreen() {
  const { width } = useWindowDimensions();
  const { colors, theme } = useAppTheme();
  const styles = useMemo(() => createDashboardStyles(colors, theme), [colors, theme]);
  const useTwoColumns = width >= 1100;
  const useWideHero = width >= 650;
  const statTones = {
    blue: {
      icon: { ios: 'map.fill', android: 'map', web: 'map' },
      color: colors.primary,
      background: colors.primarySoft,
    },
    cyan: {
      icon: { ios: 'chevron.left.forwardslash.chevron.right', android: 'code', web: 'code' },
      color: colors.cyan,
      background: colors.cyanSoft,
    },
    violet: {
      icon: { ios: 'folder.fill', android: 'folder', web: 'folder' },
      color: colors.violet,
      background: colors.violetSoft,
    },
    amber: {
      icon: { ios: 'flame.fill', android: 'local_fire_department', web: 'local_fire_department' },
      color: colors.amber,
      background: colors.amberSoft,
    },
  } satisfies Record<
    DashboardStatTone,
    { icon: SymbolViewProps['name']; color: string; background: string }
  >;

  return (
    <View style={styles.screen}>
      <PageHeader
        eyebrow="LEARN · PRACTICE · GROW · GET HIRED"
        title="Welcome back, Shyam"
        subtitle="Small, consistent steps build strong SQL skills. Here’s your learning space."
      />

      <View style={styles.hero}>
        <View style={styles.heroCopy}>
          <Badge tone="cyan">YOUR LEARNING JOURNEY</Badge>
          <Text style={styles.heroTitle}>Build your SQL developer foundation.</Text>
          <Text style={[styles.heroSubtitle, { color: colors.sidebarText }]}>
            Follow a clear path from core concepts to job-ready confidence.
          </Text>
          <DashboardAction
            href="/learning-path"
            label="Continue learning"
            colors={colors}
            styles={styles}
          />
        </View>
        {useWideHero ? (
          <View style={styles.heroArt} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <View style={styles.heroOrbit} />
            <View style={styles.heroDatabase}>
              <SymbolView
                name={{ ios: 'externaldrive.fill', android: 'database', web: 'database' }}
                size={42}
                tintColor={colors.white}
              />
            </View>
            <View style={styles.heroDot} />
          </View>
        ) : null}
      </View>

      <View style={styles.statGrid}>
        {dashboardMockData.stats.map((stat) => {
          const tone = statTones[stat.tone];
          return (
            <Card key={stat.label} style={styles.statCard}>
              <View style={[styles.statIcon, { backgroundColor: tone.background }]}>
                <SymbolView
                  name={tone.icon}
                  size={19}
                  tintColor={tone.color}
                />
              </View>
              <Text style={styles.statValue}>{stat.value}</Text>
              <Text style={styles.statLabel}>{stat.label}</Text>
            </Card>
          );
        })}
      </View>

      <View style={[styles.dashboardColumns, !useTwoColumns && styles.dashboardStack]}>
        <View style={styles.column}>
          <SectionHeader
            title="Continue Learning"
            subtitle="Pick up where you left off"
          />
          <Card style={styles.learningCard}>
            <View style={styles.learningTop}>
              <View style={styles.learningIcon}>
                <SymbolView
                  name={{ ios: 'tablecells', android: 'table', web: 'table' }}
                  size={21}
                  tintColor={colors.primary}
                />
              </View>
              <Badge tone="blue">{dashboardMockData.currentLearning.module}</Badge>
            </View>
            <Text style={styles.cardTitle}>{dashboardMockData.currentLearning.title}</Text>
            <Text style={styles.cardDescription}>{dashboardMockData.currentLearning.nextLesson}</Text>
            <View style={styles.progressCaption}>
              <Text style={styles.progressLabel}>Your path</Text>
              <Text style={styles.progressPercent}>{dashboardMockData.currentLearning.progress}%</Text>
            </View>
            <ProgressIndicator progress={dashboardMockData.currentLearning.progress} />
            <View style={styles.learningAction}>
              <DashboardAction
                href="/learning-path"
                label="Open learning path"
                colors={colors}
                styles={styles}
              />
            </View>
          </Card>

          <SectionHeader
            title="Today's Practice"
            subtitle="A little practice goes a long way"
          />
          <Card style={styles.featureCard}>
            <View style={[styles.featureIcon, { backgroundColor: colors.cyanSoft }]}>
              <SymbolView
                name={{ ios: 'chevron.left.forwardslash.chevron.right', android: 'code', web: 'code' }}
                size={21}
                tintColor={colors.cyan}
              />
            </View>
            <View style={styles.featureCopy}>
              <Text style={styles.cardTitle}>Ready for a quick SQL session?</Text>
              <Text style={styles.cardDescription}>
                Your interactive practice space will be waiting here.
              </Text>
            </View>
            <DashboardAction
              href="/sql-practice"
              label="Explore practice"
              colors={colors}
              styles={styles}
            />
          </Card>
        </View>

        <View style={styles.column}>
          <SectionHeader
            title="Your Workspace"
            subtitle="Places to build your career toolkit"
          />
          <View style={[styles.workspaceGrid, width < 650 && styles.workspaceStack]}>
            <Link href="/projects" asChild>
              <Pressable
                accessibilityRole="link"
                style={({ pressed }) => [styles.workspaceCard, pressed && styles.pressed]}>
                <View style={[styles.featureIcon, { backgroundColor: colors.violetSoft }]}>
                  <SymbolView
                    name={{ ios: 'folder.fill', android: 'folder', web: 'folder' }}
                    size={21}
                    tintColor={colors.violet}
                  />
                </View>
                <Text style={styles.cardTitle}>Projects</Text>
                <Text style={styles.cardDescription}>Real-world SQL work, step by step.</Text>
                <Badge tone="violet">COMING SOON</Badge>
              </Pressable>
            </Link>
            <Link href="/interview-room" asChild>
              <Pressable
                accessibilityRole="link"
                style={({ pressed }) => [styles.workspaceCard, pressed && styles.pressed]}>
                <View style={[styles.featureIcon, { backgroundColor: colors.amberSoft }]}>
                  <SymbolView
                    name={{ ios: 'person.2.fill', android: 'groups', web: 'groups' }}
                    size={21}
                    tintColor={colors.amber}
                  />
                </View>
                <Text style={styles.cardTitle}>Interview Prep</Text>
                <Text style={styles.cardDescription}>Get ready to show what you know.</Text>
                <Badge tone="amber">COMING SOON</Badge>
              </Pressable>
            </Link>
          </View>

          <SectionHeader title="Overall Progress" subtitle="Your sample learning snapshot" />
          <Card style={styles.overallCard}>
            <View style={styles.overallTop}>
              <View>
                <Text style={styles.cardTitle}>SQL Foundations</Text>
                <Text style={styles.cardDescription}>A strong start to your journey</Text>
              </View>
              <Text style={styles.overallValue}>{dashboardMockData.currentLearning.progress}%</Text>
            </View>
            <ProgressIndicator
              progress={dashboardMockData.currentLearning.progress}
              color={colors.green}
              trackColor={colors.greenSoft}
              height={10}
            />
            <Text style={styles.mockNotice}>Illustrative progress · sample data</Text>
          </Card>
        </View>
      </View>
    </View>
  );
}

function createDashboardStyles(
  colors: ReturnType<typeof import('@/constants/theme').getThemeColors>,
  theme: AppTheme,
) {
  const spacing = DesignTokens.spacing;

  return StyleSheet.create({
  screen: {
    flex: 1,
    minWidth: 0,
    paddingBottom: spacing.large,
  },
  hero: {
    minHeight: 220,
    backgroundColor: colors.sidebarBackground,
    borderRadius: DesignTokens.radius.large,
    padding: spacing.xlarge,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    overflow: 'hidden',
    marginBottom: spacing.large,
  },
  heroCopy: {
    flex: 1,
    alignItems: 'flex-start',
    maxWidth: 600,
    gap: spacing.medium,
    zIndex: 1,
  },
  heroTitle: {
    color: colors.white,
    fontSize: 25,
    lineHeight: 32,
    fontWeight: '800',
    letterSpacing: -0.4,
    maxWidth: 450,
  },
  heroSubtitle: {
    fontSize: DesignTokens.typography.body,
    lineHeight: 21,
    maxWidth: 430,
  },
  actionButton: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: DesignTokens.radius.small,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
    marginTop: spacing.small,
  },
  actionButtonText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.75,
  },
  heroArt: {
    width: 170,
    height: 170,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: spacing.large,
  },
  heroOrbit: {
    position: 'absolute',
    width: 155,
    height: 155,
    borderRadius: 78,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  heroDatabase: {
    width: 86,
    height: 86,
    borderRadius: 27,
    backgroundColor: colors.sidebarActive,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-8deg' }],
  },
  heroDot: {
    position: 'absolute',
    width: 13,
    height: 13,
    borderRadius: 7,
    backgroundColor: colors.cyan,
    top: 26,
    right: 18,
  },
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: spacing.medium,
    marginBottom: spacing.section,
  },
  statCard: {
    flexGrow: 1,
    flexBasis: '22%',
    minWidth: 135,
    padding: spacing.regular,
    gap: spacing.small,
  },
  statIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
    marginTop: spacing.xsmall,
  },
  statLabel: {
    color: colors.textSecondary,
    fontSize: DesignTokens.typography.caption,
    fontWeight: '600',
  },
  dashboardColumns: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.large,
  },
  dashboardStack: {
    flexDirection: 'column',
  },
  column: {
    flex: 1,
    minWidth: 0,
    gap: spacing.medium,
  },
  learningCard: {
    marginBottom: spacing.large,
  },
  learningTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.small,
    marginBottom: spacing.regular,
  },
  learningIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '700',
  },
  cardDescription: {
    color: colors.textSecondary,
    fontSize: DesignTokens.typography.caption,
    lineHeight: 18,
    marginTop: spacing.xsmall,
  },
  progressCaption: {
    marginTop: spacing.large,
    marginBottom: spacing.small,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  progressLabel: {
    color: colors.textSecondary,
    fontSize: DesignTokens.typography.caption,
    fontWeight: '600',
  },
  progressPercent: {
    color: colors.primary,
    fontSize: DesignTokens.typography.caption,
    fontWeight: '800',
  },
  learningAction: {
    marginTop: spacing.regular,
    alignSelf: 'flex-start',
  },
  featureCard: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.regular,
    marginBottom: spacing.large,
  },
  featureIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureCopy: {
    flex: 1,
    minWidth: 160,
  },
  workspaceGrid: {
    flexDirection: 'row',
    gap: spacing.medium,
    marginBottom: spacing.large,
  },
  workspaceStack: {
    flexDirection: 'column',
  },
  workspaceCard: {
    flex: 1,
    minWidth: 0,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: DesignTokens.radius.medium,
    padding: spacing.regular,
    gap: spacing.small,
    ...SemanticElevation[theme],
  },
  overallCard: {
    gap: spacing.regular,
    marginBottom: spacing.large,
  },
  overallTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.medium,
  },
  overallValue: {
    color: colors.green,
    fontSize: 25,
    fontWeight: '800',
  },
  mockNotice: {
    color: colors.textMuted,
    fontSize: 10,
  },
  });
}
