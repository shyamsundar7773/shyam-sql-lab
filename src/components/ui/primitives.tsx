import type { ComponentProps, ReactNode } from 'react';
import { useMemo } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type PressableProps,
  type StyleProp,
  type ViewProps,
  type ViewStyle,
} from 'react-native';

import { DesignTokens, SemanticElevation } from '@/constants/theme';
import { useAppTheme } from '@/contexts/theme-context';

function usePrimitiveStyles() {
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        card: {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderWidth: 1,
          borderRadius: DesignTokens.radius.medium,
          padding: DesignTokens.spacing.large,
          ...SemanticElevation[isDark ? 'dark' : 'light'],
        },
        button: {
          minHeight: 44,
          paddingHorizontal: DesignTokens.spacing.large,
          borderRadius: DesignTokens.radius.small,
          alignItems: 'center',
          justifyContent: 'center',
        },
        primaryButton: {
          backgroundColor: colors.primary,
        },
        secondaryButton: {
          backgroundColor: colors.elevatedSurface,
          borderWidth: 1,
          borderColor: colors.border,
        },
        buttonText: {
          color: colors.white,
          fontSize: DesignTokens.typography.body,
          fontWeight: '700',
        },
        secondaryButtonText: {
          color: colors.primaryText,
        },
        pressed: {
          opacity: 0.82,
        },
        badge: {
          alignSelf: 'flex-start',
          borderRadius: DesignTokens.radius.pill,
          paddingHorizontal: DesignTokens.spacing.medium,
          paddingVertical: DesignTokens.spacing.xsmall,
        },
        badgeText: {
          fontSize: DesignTokens.typography.caption,
          fontWeight: '700',
        },
        progressTrack: {
          overflow: 'hidden',
          borderRadius: DesignTokens.radius.pill,
        },
        progressFill: {
          borderRadius: DesignTokens.radius.pill,
        },
        emptyState: {
          alignItems: 'center',
          paddingHorizontal: DesignTokens.spacing.large,
          paddingVertical: DesignTokens.spacing.section,
        },
        emptyIcon: {
          width: 56,
          height: 56,
          borderRadius: DesignTokens.radius.medium,
          backgroundColor: colors.primarySoft,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: DesignTokens.spacing.regular,
        },
        emptyIconText: {
          color: colors.primary,
          fontSize: 24,
          fontWeight: '700',
        },
        emptyTitle: {
          color: colors.primaryText,
          fontSize: DesignTokens.typography.sectionTitle,
          fontWeight: '700',
          marginBottom: DesignTokens.spacing.small,
          textAlign: 'center',
        },
        emptyDescription: {
          color: colors.secondaryText,
          fontSize: DesignTokens.typography.body,
          lineHeight: 22,
          maxWidth: 420,
          textAlign: 'center',
        },
        sectionHeader: {
          alignItems: 'center',
          flexDirection: 'row',
          justifyContent: 'space-between',
          gap: DesignTokens.spacing.regular,
          marginBottom: DesignTokens.spacing.regular,
        },
        sectionTitleGroup: {
          flex: 1,
          gap: DesignTokens.spacing.xsmall,
        },
        sectionTitle: {
          color: colors.primaryText,
          fontSize: DesignTokens.typography.sectionTitle,
          fontWeight: '700',
        },
        sectionSubtitle: {
          color: colors.secondaryText,
          fontSize: DesignTokens.typography.caption,
          lineHeight: 18,
        },
        input: {
          minHeight: 46,
          color: colors.primaryText,
          backgroundColor: colors.elevatedSurface,
          borderColor: colors.border,
          borderWidth: 1,
          borderRadius: DesignTokens.radius.small,
          paddingHorizontal: DesignTokens.spacing.regular,
          paddingVertical: DesignTokens.spacing.medium,
          fontSize: DesignTokens.typography.body,
        },
        codeBlock: {
          backgroundColor: 'transparent',
          paddingHorizontal: DesignTokens.spacing.regular,
          paddingVertical: DesignTokens.spacing.medium,
        },
        codeExample: {
          backgroundColor: colors.codeBackground,
          borderColor: colors.border,
          borderWidth: 1,
          borderRadius: DesignTokens.radius.small,
          overflow: 'hidden',
        },
        codeHeader: {
          minHeight: 38,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: DesignTokens.spacing.regular,
          borderBottomWidth: 1,
        },
        codeTitle: {
          fontSize: DesignTokens.typography.caption,
          fontWeight: '700',
        },
        codeLanguage: {
          fontSize: 10,
          fontWeight: '700',
          letterSpacing: 0.7,
        },
        codeText: {
          color: colors.codeText,
          fontFamily: DesignTokens.typography.mono,
          fontSize: DesignTokens.typography.body,
          lineHeight: 22,
        },
      }),
    [colors, isDark],
  );
  const badgeStyles = useMemo(
    () =>
      StyleSheet.create({
        blue: { backgroundColor: colors.primarySoft },
        cyan: { backgroundColor: colors.accentSoft },
        green: { backgroundColor: colors.successSoft },
        amber: { backgroundColor: colors.warningSoft },
        violet: { backgroundColor: colors.primarySoft },
        neutral: { backgroundColor: colors.surfaceMuted },
      }),
    [colors],
  );
  const badgeTextStyles = useMemo(
    () =>
      StyleSheet.create({
        blue: { color: colors.primary },
        cyan: { color: colors.accent },
        green: { color: colors.success },
        amber: { color: colors.warning },
        violet: { color: colors.primary },
        neutral: { color: colors.secondaryText },
      }),
    [colors],
  );

  return { styles, badgeStyles, badgeTextStyles, colors };
}

export function Card({ children, style, ...props }: ViewProps) {
  const { styles } = usePrimitiveStyles();
  return (
    <View style={[styles.card, style]} {...props}>
      {children}
    </View>
  );
}

type ButtonProps = Omit<PressableProps, 'children'> & {
  children: ReactNode;
  variant?: 'primary' | 'secondary';
  style?: StyleProp<ViewStyle>;
};

export function Button({ children, style, variant = 'primary', ...props }: ButtonProps) {
  const { styles } = usePrimitiveStyles();
  return (
    <Pressable
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.button,
        variant === 'primary' ? styles.primaryButton : styles.secondaryButton,
        pressed && styles.pressed,
        style,
      ]}
      {...props}>
      {typeof children === 'string' ? (
        <Text style={[styles.buttonText, variant === 'secondary' && styles.secondaryButtonText]}>
          {children}
        </Text>
      ) : (
        children
      )}
    </Pressable>
  );
}

type BadgeProps = {
  children: ReactNode;
  tone?: 'blue' | 'cyan' | 'green' | 'amber' | 'violet' | 'neutral';
};

export function Badge({ children, tone = 'blue' }: BadgeProps) {
  const { styles, badgeStyles, badgeTextStyles } = usePrimitiveStyles();
  return (
    <View style={[styles.badge, badgeStyles[tone]]}>
      <Text style={[styles.badgeText, badgeTextStyles[tone]]}>{children}</Text>
    </View>
  );
}

type ProgressIndicatorProps = {
  progress: number;
  color?: string;
  trackColor?: string;
  height?: number;
};

export function ProgressIndicator({ progress, color, trackColor, height = 8 }: ProgressIndicatorProps) {
  const { styles, colors } = usePrimitiveStyles();
  const boundedProgress = Math.min(100, Math.max(0, progress));

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: boundedProgress }}
      style={[
        styles.progressTrack,
        { backgroundColor: trackColor ?? colors.primarySoft, height },
      ]}>
      <View
        style={[
          styles.progressFill,
          {
            backgroundColor: color ?? colors.primary,
            width: `${boundedProgress}%`,
            height,
          },
        ]}
      />
    </View>
  );
}

type EmptyStateProps = {
  icon: string;
  title: string;
  description: string;
};

export function EmptyState({ icon, title, description }: EmptyStateProps) {
  const { styles } = usePrimitiveStyles();
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIcon}>
        <Text style={styles.emptyIconText}>{icon}</Text>
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyDescription}>{description}</Text>
    </View>
  );
}

type SectionHeaderProps = {
  title: string;
  subtitle?: string;
  action?: ReactNode;
};

export function SectionHeader({ title, subtitle, action }: SectionHeaderProps) {
  const { styles } = usePrimitiveStyles();
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionTitleGroup}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
      </View>
      {action}
    </View>
  );
}

export function ThemedTextInput(props: ComponentProps<typeof TextInput>) {
  const { styles, colors } = usePrimitiveStyles();
  return (
    <TextInput
      placeholderTextColor={colors.mutedText}
      selectionColor={colors.primary}
      {...props}
      style={[styles.input, props.style]}
    />
  );
}

export function CodeBlock({
  children,
  title = 'SQL',
}: {
  children: string;
  title?: string;
}) {
  const { styles, colors } = usePrimitiveStyles();
  return (
    <View style={styles.codeExample}>
      <View style={[styles.codeHeader, { borderBottomColor: colors.border }]}>
        <Text style={[styles.codeTitle, { color: colors.secondaryText }]}>{title}</Text>
        <Text style={[styles.codeLanguage, { color: colors.mutedText }]}>SQL</Text>
      </View>
      <ScrollView horizontal style={styles.codeBlock}>
        <Text selectable style={styles.codeText}>
          {children}
        </Text>
      </ScrollView>
    </View>
  );
}
