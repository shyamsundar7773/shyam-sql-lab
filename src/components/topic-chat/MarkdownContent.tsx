import Markdown, {
  type MarkdownStyleMap,
  type RenderRules,
} from '@ronradtke/react-native-markdown-display';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { DesignTokens } from '@/constants/theme';
import { useAppTheme } from '@/contexts/theme-context';

export function MarkdownContent({ content }: { content: string }) {
  const { colors } = useAppTheme();
  const markdownStyles = useMemo<MarkdownStyleMap>(
    () => ({
      body: {
        color: colors.primaryText,
        fontFamily: DesignTokens.typography.family,
        fontSize: 16,
        lineHeight: 25,
        width: '100%',
      },
      paragraph: {
        marginTop: 0,
        marginBottom: 12,
        flexWrap: 'wrap',
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'flex-start',
        width: '100%',
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
        minWidth: 400,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 8,
        overflow: 'hidden',
      },
      tr: {
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderColor: colors.border,
        flexDirection: 'row',
      },
      th: {
        flex: 1,
        minWidth: 110,
        padding: 9,
        backgroundColor: colors.surfaceMuted,
      },
      td: {
        flex: 1,
        minWidth: 110,
        padding: 9,
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
    [colors],
  );
  const rules = useMemo<RenderRules>(
    () => ({
      table: (node, children, _parent, styles) => (
        <ScrollView
          key={node.key}
          horizontal
          nestedScrollEnabled
          showsHorizontalScrollIndicator
          style={tableStyles.viewport}>
          <View style={styles._VIEW_SAFE_table}>{children}</View>
        </ScrollView>
      ),
      code_block: (node, _children, _parent, styles) => (
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
    }),
    [],
  );

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
});

const tableStyles = StyleSheet.create({
  viewport: {
    maxWidth: '100%',
  },
});
