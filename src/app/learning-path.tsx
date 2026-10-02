import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { PageHeader } from '@/components/PageHeader';
import { Badge, Card } from '@/components/ui/primitives';
import { DesignTokens } from '@/constants/theme';
import { useAppTheme } from '@/contexts/theme-context';
import {
  getCategoryById,
  getLearningOverview,
  getModuleById,
} from '@/lib/learning-content';

export default function LearningPathScreen() {
  const { width } = useWindowDimensions();
  const { categoryId, moduleId } = useLocalSearchParams<{
    categoryId?: string;
    moduleId?: string;
  }>();
  const { colors } = useAppTheme();
  const overview = getLearningOverview();
  const category = getCategoryById(categoryId);
  const selectedModule = getModuleById(category, moduleId);
  const isModuleView = Boolean(category && selectedModule);
  const isCategoryView = Boolean(category && !selectedModule);
  const isNarrow = width < 360;

  const selectCategory = (nextCategoryId: string) => {
    router.push({ pathname: '/learning-path', params: { categoryId: nextCategoryId } });
  };

  const selectModule = (nextModuleId: string) => {
    if (category) {
      router.push({
        pathname: '/learning-path',
        params: { categoryId: category.id, moduleId: nextModuleId },
      });
    }
  };

  const openTopic = (topicId: string) => {
    if (category && selectedModule) {
      router.push({
        pathname: '/topic',
        params: { topicId, categoryId: category.id, moduleId: selectedModule.id },
      });
    }
  };

  const returnToPath = () => {
    router.push('/learning-path');
  };

  return (
    <View style={styles.screen}>
      {isCategoryView || isModuleView ? (
        <View style={styles.breadcrumbs} accessibilityLabel="Learning path breadcrumb">
          <Crumb label="Learning Path" onPress={returnToPath} colors={colors} />
          {category ? (
            <>
              <SymbolView
                name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
                size={13}
                tintColor={colors.mutedText}
              />
              <Crumb
                label={category.title}
                onPress={() =>
                  router.push({
                    pathname: '/learning-path',
                    params: { categoryId: category.id },
                  })
                }
                colors={colors}
              />
            </>
          ) : null}
          {isModuleView && selectedModule ? (
            <>
              <SymbolView
                name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
                size={13}
                tintColor={colors.mutedText}
              />
              <Text style={[styles.currentCrumb, { color: colors.secondaryText }]}>
                {selectedModule.title}
              </Text>
            </>
          ) : null}
        </View>
      ) : null}

      <PageHeader
        eyebrow="STRUCTURED SQL CURRICULUM"
        title={selectedModule?.title ?? category?.title ?? 'Learning Path'}
        subtitle={
          selectedModule?.description ??
          category?.description ??
          'Choose a learning area and move through focused modules, topics, and practical explanations.'
        }
      />

      {!category ? (
        <View style={styles.content}>
          <View style={[styles.introCard, { backgroundColor: colors.sidebarBackground }]}>
            <View style={styles.introCopy}>
              <Badge tone="cyan">YOUR SQL JOURNEY</Badge>
              <Text style={[styles.introTitle, { color: colors.white }]}>
                Learn concepts in a clear sequence.
              </Text>
              <Text style={[styles.introDescription, { color: colors.sidebarText }]}>
                Start with query foundations, then build toward summaries and relationships between data.
              </Text>
            </View>
            <View style={[styles.pathIcon, { backgroundColor: colors.primarySoft }]}>
              <SymbolView
                name={{ ios: 'map.fill', android: 'map', web: 'map' }}
                size={26}
                tintColor={colors.primary}
              />
            </View>
          </View>
          <Text style={[styles.sectionTitle, { color: colors.primaryText }]}>Learning categories</Text>
          <View style={styles.grid}>
            {overview.map(({ category: item, moduleCount, topicCount }, index) => (
              <Card
                key={item.id}
                style={[styles.listCard, isNarrow && styles.singleColumnCard]}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => selectCategory(item.id)}
                  style={({ pressed }) => [styles.cardPressable, pressed && styles.pressed]}>
                  <View style={styles.cardTop}>
                    <View
                      style={[
                        styles.iconBadge,
                        { backgroundColor: item.accent === 'cyan' ? colors.accentSoft : colors.primarySoft },
                      ]}>
                      <SymbolView
                        name={
                          index === 0
                            ? { ios: 'square.stack.3d.up.fill', android: 'layers', web: 'layers' }
                            : { ios: 'arrow.triangle.branch', android: 'schema', web: 'schema' }
                        }
                        size={21}
                        tintColor={item.accent === 'cyan' ? colors.accent : colors.primary}
                      />
                    </View>
                    <SymbolView
                      name={{ ios: 'arrow.up.right', android: 'north_east', web: 'north_east' }}
                      size={17}
                      tintColor={colors.mutedText}
                    />
                  </View>
                  <Text style={[styles.cardTitle, { color: colors.primaryText }]}>{item.title}</Text>
                  <Text style={[styles.cardDescription, { color: colors.secondaryText }]}>
                    {item.description}
                  </Text>
                  <View style={styles.cardMeta}>
                    <Badge tone={item.accent === 'cyan' ? 'cyan' : 'blue'}>
                      {`${moduleCount} modules`}
                    </Badge>
                    <Text style={[styles.metaText, { color: colors.mutedText }]}>
                      {`${topicCount} topics`}
                    </Text>
                  </View>
                </Pressable>
              </Card>
            ))}
          </View>
          <Card style={styles.calloutCard}>
            <Text style={[styles.cardTitle, { color: colors.primaryText }]}>
              A steady path, one topic at a time
            </Text>
            <Text style={[styles.cardDescription, { color: colors.secondaryText }]}>
              Begin with any category and read each topic at your own pace.
            </Text>
          </Card>
        </View>
      ) : isCategoryView ? (
        <View style={styles.grid}>
          {category.modules.map((item, index) => (
            <Card
              key={item.id}
              style={[styles.listCard, isNarrow && styles.singleColumnCard]}>
              <Pressable
                accessibilityRole="button"
                onPress={() => selectModule(item.id)}
                style={({ pressed }) => [styles.cardPressable, pressed && styles.pressed]}>
                <View style={styles.cardTop}>
                  <View style={[styles.numberBadge, { backgroundColor: colors.primarySoft }]}>
                    <Text style={[styles.numberText, { color: colors.primary }]}>
                      {String(index + 1).padStart(2, '0')}
                    </Text>
                  </View>
                  <Text style={[styles.metaText, { color: colors.mutedText }]}>
                    {`${item.topics.length} topics`}
                  </Text>
                </View>
                <Text style={[styles.cardTitle, { color: colors.primaryText }]}>{item.title}</Text>
                <Text style={[styles.cardDescription, { color: colors.secondaryText }]}>
                  {item.description}
                </Text>
                <Text style={[styles.actionText, { color: colors.primary }]}>Explore module →</Text>
              </Pressable>
            </Card>
          ))}
        </View>
      ) : isModuleView && selectedModule ? (
        <View style={styles.topicList}>
          {selectedModule.topics.map((item, index) => (
            <Card key={item.id} style={styles.topicCard}>
              <Pressable
                accessibilityRole="button"
                onPress={() => openTopic(item.id)}
                style={({ pressed }) => [styles.topicPressable, pressed && styles.pressed]}>
                <View style={[styles.numberBadge, { backgroundColor: colors.accentSoft }]}>
                  <Text style={[styles.numberText, { color: colors.accent }]}>
                    {String(index + 1).padStart(2, '0')}
                  </Text>
                </View>
                <View style={styles.topicCopy}>
                  <Text style={[styles.cardTitle, { color: colors.primaryText }]}>{item.title}</Text>
                  <Text style={[styles.cardDescription, { color: colors.secondaryText }]}>
                    {item.summary}
                  </Text>
                  <View style={styles.topicMeta}>
                    <Text style={[styles.metaText, { color: colors.mutedText }]}>
                      {`${item.estimatedMinutes} min`}
                    </Text>
                    <Text style={[styles.metaText, { color: colors.mutedText }]}>
                      {`${item.subtopics.length} subtopics`}
                    </Text>
                  </View>
                </View>
                <SymbolView
                  name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
                  size={18}
                  tintColor={colors.mutedText}
                />
              </Pressable>
            </Card>
          ))}
        </View>
      ) : (
        <Card>
          <Text style={[styles.cardTitle, { color: colors.primaryText }]}>
            This learning section is unavailable.
          </Text>
          <Pressable onPress={returnToPath} accessibilityRole="button">
            <Text style={[styles.actionText, { color: colors.primary }]}>Return to Learning Path</Text>
          </Pressable>
        </Card>
      )}
    </View>
  );
}

function Crumb({
  label,
  onPress,
  colors,
}: {
  label: string;
  onPress: () => void;
  colors: ReturnType<typeof import('@/constants/theme').getThemeColors>;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} hitSlop={6}>
      <Text style={[styles.crumb, { color: colors.primary }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    width: '100%',
  },
  breadcrumbs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    marginBottom: 20,
  },
  crumb: {
    fontSize: 12,
    fontWeight: '700',
  },
  currentCrumb: {
    fontSize: 12,
    fontWeight: '600',
  },
  content: {
    gap: 24,
  },
  introCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 18,
    padding: 24,
    borderRadius: DesignTokens.radius.large,
  },
  introCopy: {
    flex: 1,
    gap: 10,
  },
  introTitle: {
    maxWidth: 560,
    fontSize: 22,
    lineHeight: 29,
    fontWeight: '800',
  },
  introDescription: {
    maxWidth: 620,
    fontSize: 13,
    lineHeight: 20,
  },
  pathIcon: {
    width: 58,
    height: 58,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    marginBottom: -10,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  listCard: {
    flexGrow: 1,
    flexBasis: 300,
    maxWidth: 620,
    padding: 0,
    overflow: 'hidden',
  },
  singleColumnCard: {
    flexBasis: '100%',
    maxWidth: '100%',
  },
  cardPressable: {
    minHeight: 190,
    padding: 22,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  iconBadge: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numberBadge: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numberText: {
    fontSize: 13,
    fontWeight: '800',
  },
  cardTitle: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '800',
  },
  cardDescription: {
    fontSize: 12,
    lineHeight: 19,
    marginTop: 7,
  },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 17,
  },
  metaText: {
    fontSize: 11,
    fontWeight: '600',
  },
  calloutCard: {
    gap: 8,
  },
  actionText: {
    fontSize: 12,
    fontWeight: '800',
    marginTop: 16,
  },
  topicList: {
    gap: 12,
  },
  topicCard: {
    padding: 0,
    overflow: 'hidden',
  },
  topicPressable: {
    minHeight: 112,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 20,
  },
  topicCopy: {
    flex: 1,
    minWidth: 0,
  },
  topicMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    marginTop: 12,
  },
  pressed: {
    opacity: 0.76,
  },
});
