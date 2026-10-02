import { StyleSheet, Text, View } from 'react-native';

import { DesignTokens } from '@/constants/theme';
import { useAppTheme } from '@/contexts/theme-context';

type PageHeaderProps = {
  title: string;
  subtitle: string;
  eyebrow?: string;
};

export function PageHeader({ title, subtitle, eyebrow = 'YOUR LEARNING SPACE' }: PageHeaderProps) {
  const { colors } = useAppTheme();

  return (
    <View style={styles.header}>
      <View style={styles.headingCopy}>
        <Text style={[styles.eyebrow, { color: colors.primary }]}>{eyebrow}</Text>
        <Text style={[styles.title, { color: colors.primaryText }]}>{title}</Text>
        <Text style={[styles.subtitle, { color: colors.secondaryText }]}>{subtitle}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: DesignTokens.spacing.regular,
    marginBottom: DesignTokens.spacing.xlarge,
  },
  headingCopy: {
    flex: 1,
    gap: 7,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  title: {
    fontSize: DesignTokens.typography.pageTitle,
    lineHeight: 35,
    fontWeight: '800',
    letterSpacing: -0.7,
  },
  subtitle: {
    fontSize: DesignTokens.typography.body,
    lineHeight: 21,
  },
});
