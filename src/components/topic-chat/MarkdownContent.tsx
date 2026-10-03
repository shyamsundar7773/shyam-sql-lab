import Markdown, {
  type MarkdownStyleMap,
  type RenderRules,
} from '@ronradtke/react-native-markdown-display';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { DesignTokens } from '@/constants/theme';
import { useAppTheme } from '@/contexts/theme-context';

export function MarkdownContent({
  content,
  compactContent = false,
}: {
  content: string;
  compactContent?: boolean;
}) {
  const { colors } = useAppTheme();
  const markdownStyles = useMemo<MarkdownStyleMap>(
    () => ({
      body: {
        color: colors.primaryText,
        fontFamily: DesignTokens.typography.family,
        fontSize: 16,
        lineHeight: 25,
        width: '100%',
        minWidth: 0,
        flexShrink: 1,
      },
      paragraph: {
        marginTop: 0,
        marginBottom: compactContent ? 4 : 12,
        flexWrap: 'wrap',
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'flex-start',
        width: '100%',
        minWidth: 0,
        flexShrink: 1,
      },
      heading1: {
        color: colors.primaryText,
        fontFamily: DesignTokens.typography.family,
        fontSize: 23,
        lineHeight: 30,
        fontWeight: '800',
        marginTop: 12,
        marginBottom: 8,
      },
      heading2: {
        color: colors.primaryText,
        fontFamily: DesignTokens.typography.family,
        fontSize: 20,
        lineHeight: 27,
        fontWeight: '800',
        marginTop: 10,
        marginBottom: 6,
      },
      heading3: {
        color: colors.primaryText,
        fontFamily: DesignTokens.typography.family,
        fontSize: 18,
        lineHeight: 25,
        fontWeight: '700',
        marginTop: 8,
        marginBottom: 5,
      },
      heading4: {
        color: colors.primaryText,
        fontSize: 16,
        lineHeight: 23,
        fontWeight: '700',
        marginTop: 6,
        marginBottom: 4,
      },
      heading5: {
        color: colors.primaryText,
        fontSize: 16,
        lineHeight: 23,
        fontWeight: '700',
      },
      heading6: {
        color: colors.secondaryText,
        fontSize: 15,
        lineHeight: 22,
        fontWeight: '700',
      },
      strong: {
        color: colors.primaryText,
        fontWeight: '800',
      },
      em: {
        color: colors.primaryText,
        fontStyle: 'italic',
      },
      bullet_list: {
        marginBottom: 10,
      },
      ordered_list: {
        marginBottom: 10,
      },
      list_item: {
        marginBottom: 5,
      },
      bullet_list_icon: {
        color: colors.primary,
        marginLeft: 3,
        marginRight: 9,
      },
      ordered_list_icon: {
        color: colors.primary,
        marginLeft: 3,
        marginRight: 9,
      },
      bullet_list_content: {
        flex: 1,
      },
      ordered_list_content: {
        flex: 1,
      },
      code_inline: {
        color: colors.codeText,
        backgroundColor: colors.codeBackground,
        borderColor: colors.border,
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: 4,
        paddingHorizontal: 4,
        paddingVertical: 1,
        fontFamily: DesignTokens.typography.mono,
        fontSize: 14,
      },
      fence: {
        backgroundColor: colors.codeBackground,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: 10,
        overflow: 'hidden',
        marginVertical: 8,
      },
      fence_header: {
        backgroundColor: colors.surfaceMuted,
        borderBottomColor: colors.border,
        borderBottomWidth: StyleSheet.hairlineWidth,
        minHeight: 30,
      },
      fence_language_label: {
        color: colors.secondaryText,
        fontFamily: DesignTokens.typography.mono,
        fontSize: 12,
      },
      fence_code: {
        backgroundColor: colors.codeBackground,
        paddingHorizontal: 12,
        paddingVertical: 10,
      },
      fence_token: {
        color: colors.codeText,
        fontFamily: DesignTokens.typography.mono,
        fontSize: 14,
        lineHeight: 22,
      },
      code_block: {
        color: colors.codeText,
        backgroundColor: colors.codeBackground,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: 8,
        padding: 12,
        fontFamily: DesignTokens.typography.mono,
        fontSize: 14,
        lineHeight: 22,
      },
      table: {
        width: compactContent ? '100%' : undefined,
        maxWidth: compactContent ? '100%' : undefined,
        minWidth: compactContent ? 0 : 400,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 8,
        overflow: 'hidden',
      },
      tr: {
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderColor: colors.border,
        flexDirection: 'row',
        width: compactContent ? '100%' : undefined,
      },
      th: {
        flex: 1,
        minWidth: compactContent ? 0 : 110,
        flexShrink: compactContent ? 1 : 0,
        padding: compactContent ? 6 : 9,
        backgroundColor: colors.surfaceMuted,
      },
      td: {
        flex: 1,
        minWidth: compactContent ? 0 : 110,
        flexShrink: compactContent ? 1 : 0,
        padding: compactContent ? 6 : 9,
      },
      link: {
        color: colors.primary,
        textDecorationLine: 'underline',
      },
      blockquote: {
        backgroundColor: colors.surfaceMuted,
        borderColor: colors.primary,
        borderLeftWidth: 3,
        marginLeft: 0,
        paddingHorizontal: 12,
        paddingVertical: 4,
      },
    }),
    [colors, compactContent],
  );
  const rules = useMemo<RenderRules>(() => {
    const renderRules: RenderRules = {
      table: compactContent
        ? (node, children, _parent, styles) => (
            <View
              key={node.key}
              style={[styles._VIEW_SAFE_table, codeStyles.wrapped]}>
              {children}
            </View>
          )
        : (node, children, _parent, styles) => (
            <ScrollView
              key={node.key}
              horizontal
              nestedScrollEnabled
              showsHorizontalScrollIndicator
              style={tableStyles.viewport}>
              <View style={styles._VIEW_SAFE_table}>{children}</View>
            </ScrollView>
          ),
      code_block: compactContent
        ? (node, _children, _parent, styles) => (
            <Text
              key={node.key}
              selectable
              style={[styles.code_block, codeStyles.wrapped]}>
              {node.content.replace(/\n$/, '')}
            </Text>
          )
        : (node, _children, _parent, styles) => (
            <ScrollView
              key={node.key}
              horizontal
              nestedScrollEnabled
              showsHorizontalScrollIndicator
              style={codeStyles.viewport}>
              <Text selectable style={styles.code_block}>
                {node.content.replace(/\n$/, '')}
              </Text>
            </ScrollView>
          ),
    };

    if (compactContent) {
      renderRules.fence = (node, _children, _parent, styles) => (
        <View key={node.key} style={styles._VIEW_SAFE_fence}>
          <View style={styles._VIEW_SAFE_fence_code}>
            <Text selectable style={[styles.fence_token, codeStyles.wrapped]}>
              {node.content.replace(/\n$/, '')}
            </Text>
          </View>
        </View>
      );
    }

    return renderRules;
  }, [compactContent]);

  return (
    <Markdown style={markdownStyles} rules={rules}>
      {content}
    </Markdown>
  );
}

const codeStyles = StyleSheet.create({
  viewport: {
    maxWidth: '100%',
  },
  wrapped: {
    width: '100%',
    flexShrink: 1,
    flexWrap: 'wrap',
  },
});

const tableStyles = StyleSheet.create({
  viewport: {
    maxWidth: '100%',
  },
});
