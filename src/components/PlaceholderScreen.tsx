import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { StyleSheet, Text, View } from 'react-native';

import { Card, EmptyState } from '@/components/ui/primitives';
import { DesignTokens } from '@/constants/theme';
import { useAppTheme } from '@/contexts/theme-context';

type PlaceholderScreenProps = {
  title: string;
  description: string;
  icon: SymbolViewProps['name'];
};

export function PlaceholderScreen({ title, description, icon }: PlaceholderScreenProps) {
  const { colors } = useAppTheme();

  return (
    <View>
      <Text style={[styles.eyebrow, { color: colors.primary }]}>COMING IN A FUTURE PHASE</Text>
      <Text style={[styles.title, { color: colors.primaryText }]}>{title}</Text>
      <Text style={[styles.subtitle, { color: colors.secondaryText }]}>
        A focused space for your next step as a SQL developer.
      </Text>
      <Card style={styles.card}>
        <View style={[styles.icon, { backgroundColor: colors.primarySoft }]}>
          <SymbolView name={icon} size={27} tintColor={colors.primary} />
        </View>
        <EmptyState
          icon="✦"
          title="Your workspace is ready"
          description={description}
        />
        <Text style={[styles.note, { color: colors.mutedText }]}>
          This area is a UI placeholder. No learning data or product functionality is connected yet.
        </Text>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  eyebrow: {
    fontSize: 10,
    letterSpacing: 1,
    fontWeight: '800',
    marginBottom: 7,
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
    marginTop: 8,
    marginBottom: DesignTokens.spacing.xlarge,
  },
  card: {
    alignItems: 'center',
    paddingVertical: DesignTokens.spacing.section,
  },
  icon: {
    width: 56,
    height: 56,
    borderRadius: DesignTokens.radius.medium,
    alignItems: 'center',
    justifyContent: 'center',
  },
  note: {
    fontSize: DesignTokens.typography.caption,
    lineHeight: 18,
    maxWidth: 420,
    textAlign: 'center',
    marginTop: DesignTokens.spacing.regular,
  },
});
