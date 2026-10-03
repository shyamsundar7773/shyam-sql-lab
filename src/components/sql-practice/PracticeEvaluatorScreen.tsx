import { useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MarkdownContent } from '@/components/topic-chat/MarkdownContent';
import { DesignTokens } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { useAppTheme } from '@/contexts/theme-context';
import {
  askPracticeEvaluator,
  type PracticeChatMessage,
  type PracticeLearningContext,
} from '@/lib/api';
import { getPracticeLearningContext, type PracticePathIds } from '@/lib/sql-practice-notes';
import { supabase } from '@/lib/supabase';
import type {
  PracticeConversationMessage,
  PracticeQuestionRecord,
  SqlPracticeExecutionResult,
} from '@/types/sql-practice';

const firstPrompt =
  'Please review my current SQL approach for this question. Explain what is correct, what could improve, and why.';

type PracticeSetHeader = {
  id: string;
  set_number: number;
  current_question_index: number;
  config: PracticePathIds;
};

export default function PracticeEvaluatorScreen() {
  const { setId, questionId } = useLocalSearchParams<{
    setId: string;
    questionId: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const { session } = useAuth();
  const [question, setQuestion] = useState<PracticeQuestionRecord | null>(null);
  const [set, setSet] = useState<PracticeSetHeader | null>(null);
  const [messages, setMessages] = useState<PracticeConversationMessage[]>([]);
  const [messageDraft, setMessageDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const messageListRef = useRef<ScrollView>(null);
  const latestMessagesRef = useRef<PracticeConversationMessage[]>([]);
  const sendLock = useRef(false);
  const isAtLatestMessage = useRef(true);
  const learningContext = set ? getPracticeLearningContext(set.config) : null;

  const scrollToLatestMessage = useCallback(() => {
    isAtLatestMessage.current = true;
    setShowJumpToLatest(false);
    messageListRef.current?.scrollToEnd({ animated: true });
  }, []);

  const updateMessages = (next: PracticeConversationMessage[]) => {
    latestMessagesRef.current = next;
    setMessages(next);
  };

  const sendMessage = useCallback(
    async (
      message: string,
      currentQuestion: PracticeQuestionRecord,
      context: PracticeLearningContext,
      history = latestMessagesRef.current,
    ) => {
      if (
        sendLock.current ||
        !supabase ||
        !session?.access_token ||
        !message.trim()
      ) {
        return;
      }
      sendLock.current = true;
      setSending(true);
      setError('');
      try {
        const userResult = await supabase
          .from('practice_evaluator_messages')
          .insert({ question_id: currentQuestion.id, role: 'user', content: message.trim() })
          .select('*')
          .single();
        if (userResult.error) {
          throw userResult.error;
        }
        const withUserMessage = [...history, userResult.data as PracticeConversationMessage];
        updateMessages(withUserMessage);
        setMessageDraft('');
        requestAnimationFrame(scrollToLatestMessage);

        const reply = await askPracticeEvaluator({
          accessToken: session.access_token,
          context,
          question: currentQuestion.content,
          sql: currentQuestion.draft_sql,
          result: currentQuestion.latest_result as SqlPracticeExecutionResult | null,
          history: history
            .slice(-20)
            .map(({ role, content }): PracticeChatMessage => ({ role, content })),
          message: message.trim(),
        });

        const assistantResult = await supabase
          .from('practice_evaluator_messages')
          .insert({ question_id: currentQuestion.id, role: 'assistant', content: reply })
          .select('*')
          .single();
        if (assistantResult.error) {
          throw new Error(`The AI response was received but could not be saved: ${assistantResult.error.message}`);
        }
        updateMessages([...withUserMessage, assistantResult.data as PracticeConversationMessage]);
      } catch (sendError) {
        setError(
          getErrorMessage(
            sendError,
            'The evaluator could not respond. Your question is saved; retry or ask again.',
          ),
        );
      } finally {
        sendLock.current = false;
        setSending(false);
      }
    },
    [scrollToLatestMessage, session?.access_token],
  );

  useEffect(() => {
    let active = true;
    const loadConversation = async () => {
      if (!setId || !questionId || !supabase) {
        setError('This evaluator link is missing its practice set or question.');
        setLoading(false);
        return;
      }
      setLoading(true);
      setError('');
      try {
        const [questionResult, setResult, messagesResult] = await Promise.all([
          supabase.from('practice_questions').select('*').eq('id', questionId).eq('set_id', setId).single(),
          supabase
            .from('practice_sets')
            .select('id,set_number,current_question_index,config')
            .eq('id', setId)
            .single(),
          supabase
            .from('practice_evaluator_messages')
            .select('*')
            .eq('question_id', questionId)
            .order('created_at', { ascending: true })
            .order('id', { ascending: true }),
        ]);
        if (questionResult.error) {
          throw questionResult.error;
        }
        if (setResult.error) {
          throw setResult.error;
        }
        if (messagesResult.error) {
          throw messagesResult.error;
        }
        if (!active) {
          return;
        }
        const loadedQuestion = questionResult.data as unknown as PracticeQuestionRecord;
        const loadedSet = setResult.data as PracticeSetHeader;
        const loadedMessages = (messagesResult.data ?? []) as unknown as PracticeConversationMessage[];
        setQuestion(loadedQuestion);
        setSet(loadedSet);
        updateMessages(loadedMessages);
        if (loadedMessages.length === 0) {
          await sendMessage(
            firstPrompt,
            loadedQuestion,
            getPracticeLearningContext(loadedSet.config),
            [],
          );
        }
      } catch (loadError) {
        if (active) {
          setError(getErrorMessage(loadError, 'The evaluator conversation could not be loaded.'));
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };
    void loadConversation();
    return () => {
      active = false;
    };
  }, [questionId, sendMessage, setId]);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable
          accessibilityLabel="Back to question workspace"
          accessibilityRole="button"
          onPress={() => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.replace('/sql-practice');
            }
          }}
          style={styles.backButton}>
          <SymbolView
            name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }}
            size={21}
            tintColor={colors.primaryText}
          />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: colors.primaryText }]}>AI Evaluator</Text>
          <Text style={[styles.subtitle, { color: colors.secondaryText }]} numberOfLines={1}>
            {set && question
              ? `${learningContext?.topic} · Set ${set.set_number} · Question ${question.position + 1}`
              : 'Your SQL learning conversation'}
          </Text>
        </View>
      </View>

      <View style={styles.conversation}>
        <ScrollView
          ref={messageListRef}
          contentContainerStyle={styles.messageList}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => {
            if (isAtLatestMessage.current) {
              requestAnimationFrame(() =>
                messageListRef.current?.scrollToEnd({ animated: false }),
              );
            }
          }}
          onScroll={(event) => {
            const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
            const isNearLatest = contentSize.height - contentOffset.y - layoutMeasurement.height < 48;
            isAtLatestMessage.current = isNearLatest;
            setShowJumpToLatest(!isNearLatest);
          }}
          scrollEventThrottle={16}
          style={styles.messageScroll}>
          {loading ? <ActivityIndicator color={colors.primary} style={styles.loading} /> : null}
          {messages.map((message) => (
            <View
              key={message.id}
              style={[
                styles.messageRow,
                { justifyContent: message.role === 'user' ? 'flex-end' : 'flex-start' },
              ]}>
              <View
                style={[
                  styles.messageBubble,
                  message.role === 'user'
                    ? { backgroundColor: colors.primarySoft }
                    : { backgroundColor: 'transparent' },
                ]}>
                {message.role === 'assistant' ? (
                  <MarkdownContent content={message.content} compactContent />
                ) : (
                  <Text style={[styles.userMessage, { color: colors.primaryText }]}>
                    {message.content}
                  </Text>
                )}
              </View>
            </View>
          ))}
          {sending ? (
            <ActivityIndicator
              accessibilityLabel="Evaluator is responding"
              color={colors.primary}
              style={styles.responseLoading}
            />
          ) : null}
          {error ? (
            <Text accessibilityRole="alert" style={[styles.error, { color: colors.danger }]}>
              {error}
            </Text>
          ) : null}
        </ScrollView>
        {showJumpToLatest ? (
          <Pressable
            accessibilityLabel="Jump to latest message"
            accessibilityRole="button"
            onPress={scrollToLatestMessage}
            style={[
              styles.jumpToLatest,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}>
            <SymbolView
              name={{ ios: 'arrow.down', android: 'arrow_downward', web: 'arrow_downward' }}
              size={18}
              tintColor={colors.primaryText}
            />
          </Pressable>
        ) : null}
      </View>

      <View
        style={[
          styles.composerArea,
          {
            paddingBottom: Math.max(insets.bottom, DesignTokens.spacing.small),
            borderTopColor: colors.border,
            backgroundColor: colors.background,
          },
        ]}>
        <View style={[styles.composer, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}>
          <TextInput
            accessibilityLabel="Ask the SQL evaluator a follow-up question"
            maxLength={4_000}
            multiline
            value={messageDraft}
            onChangeText={setMessageDraft}
            onFocus={() => requestAnimationFrame(() => messageListRef.current?.scrollToEnd({ animated: true }))}
            placeholder="Ask about this SQL…"
            placeholderTextColor={colors.mutedText}
            style={[styles.input, { color: colors.primaryText }]}
          />
          <Pressable
            accessibilityLabel="Send message"
            accessibilityRole="button"
            disabled={sending || loading || !messageDraft.trim()}
            onPress={() => {
              if (question && learningContext) {
                void sendMessage(messageDraft, question, learningContext);
              }
            }}
            style={({ pressed }) => [
              styles.sendButton,
              { backgroundColor: colors.primary },
              pressed && styles.pressed,
              (sending || loading || !messageDraft.trim()) && styles.sendDisabled,
            ]}>
            {sending ? (
              <ActivityIndicator color={colors.white} size="small" />
            ) : (
              <SymbolView
                name={{ ios: 'arrow.up', android: 'arrow_upward', web: 'arrow_upward' }}
                size={20}
                tintColor={colors.white}
              />
            )}
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    minWidth: 0,
  },
  header: {
    minHeight: 62,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 10,
  },
  backButton: {
    width: 42,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  messageScroll: {
    flex: 1,
    minWidth: 0,
  },
  conversation: {
    flex: 1,
    minWidth: 0,
    position: 'relative',
  },
  messageList: {
    flexGrow: 1,
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 18,
  },
  messageRow: {
    width: '100%',
    minWidth: 0,
    flexDirection: 'row',
  },
  messageBubble: {
    maxWidth: '96%',
    minWidth: 0,
    flexShrink: 1,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 10,
    overflow: 'hidden',
  },
  userMessage: {
    fontSize: 15,
    lineHeight: 22,
  },
  loading: {
    marginTop: 28,
  },
  responseLoading: {
    alignSelf: 'flex-start',
    marginVertical: 6,
  },
  jumpToLatest: {
    position: 'absolute',
    bottom: 14,
    alignSelf: 'center',
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
  },
  error: {
    fontSize: 13,
    lineHeight: 19,
    paddingHorizontal: 6,
  },
  composerArea: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  composer: {
    minHeight: 52,
    maxWidth: 860,
    width: '100%',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    borderWidth: 1,
    borderRadius: 28,
    padding: 5,
  },
  input: {
    flex: 1,
    minWidth: 0,
    minHeight: 40,
    maxHeight: 116,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 15,
    lineHeight: 21,
  },
  sendButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: {
    opacity: 0.48,
  },
  pressed: {
    opacity: 0.8,
  },
});

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string' &&
    error.message
  ) {
    return error.message;
  }
  return fallback;
}
