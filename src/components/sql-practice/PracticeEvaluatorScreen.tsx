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
  type TextInputKeyPressEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MarkdownContent } from '@/components/topic-chat/MarkdownContent';
import { DesignTokens } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { useAppTheme } from '@/contexts/theme-context';
import {
  askPracticeEvaluator,
  type PracticeLearningContext,
} from '@/lib/api';
import {
  buildPracticeAttemptReviewPrompt,
  getPracticeEvaluatorBackRoute,
  getPracticeEvaluatorExecution,
  getPendingPracticeEvaluatorUserMessage,
  getPracticeEvaluatorRequestHistory,
  getPracticeLearningContext,
  type PracticeEvaluatorExecution,
  type PracticeNotesAttempt,
  type PracticePathIds,
} from '@/lib/sql-practice-notes';
import { supabase } from '@/lib/supabase';
import type {
  PracticeConversationMessage,
  PracticeQuestionRecord,
  SqlPracticeExecutionResult,
} from '@/types/sql-practice';

const firstPrompt =
  'I have not run SQL for my current draft yet. Please help me understand the question with a concise hint, without evaluating an answer or giving the full solution.';

type PracticeSetHeader = {
  id: string;
  set_number: number;
  current_question_index: number;
  config: PracticePathIds;
};

type PracticeAttempt = {
  id: string;
  question_id: string;
  sql: string;
  execution_result: SqlPracticeExecutionResult | null;
  created_at: string;
};

export default function PracticeEvaluatorScreen() {
  const { setId, questionId, attemptId } = useLocalSearchParams<{
    setId: string;
    questionId: string;
    attemptId?: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const { session } = useAuth();
  const [question, setQuestion] = useState<PracticeQuestionRecord | null>(null);
  const [set, setSet] = useState<PracticeSetHeader | null>(null);
  const [attempt, setAttempt] = useState<PracticeAttempt | null>(null);
  const [messages, setMessages] = useState<PracticeConversationMessage[]>([]);
  const [messageDraft, setMessageDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const messageListRef = useRef<ScrollView>(null);
  const latestMessagesRef = useRef<PracticeConversationMessage[]>([]);
  const sendLock = useRef(false);
  const isAtLatestMessage = useRef(true);
  const learningContext = set ? getPracticeLearningContext(set.config) : null;
  const execution = question
    ? getPracticeEvaluatorExecution(
        question.id,
        question.draft_sql,
        attempt as PracticeNotesAttempt | null,
      )
    : ({ status: 'not_executed' } satisfies PracticeEvaluatorExecution);

  const scrollToLatestMessage = useCallback(() => {
    isAtLatestMessage.current = true;
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
      currentExecution: PracticeEvaluatorExecution,
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
        const trimmedMessage = message.trim();
        const pendingMessage = getPendingPracticeEvaluatorUserMessage(history, trimmedMessage);
        let withUserMessage = history;
        let requestHistory = history;
        if (pendingMessage) {
          requestHistory = history.slice(0, -1);
        } else {
          const userResult = await supabase
            .from('practice_evaluator_messages')
            .insert({ question_id: currentQuestion.id, role: 'user', content: trimmedMessage })
            .select('*')
            .single();
          if (userResult.error) {
            throw userResult.error;
          }
          withUserMessage = [...history, userResult.data as PracticeConversationMessage];
          updateMessages(withUserMessage);
        }
        setMessageDraft('');
        requestAnimationFrame(scrollToLatestMessage);

        const reply = await askPracticeEvaluator({
          accessToken: session.access_token,
          context,
          question: currentQuestion.content,
          draftSql: currentQuestion.draft_sql,
          execution: currentExecution,
          history: getPracticeEvaluatorRequestHistory(requestHistory),
          message: trimmedMessage,
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

  const submitDraft = useCallback(() => {
    if (!loading && !sending && question && learningContext) {
      void sendMessage(messageDraft, question, learningContext, execution);
    }
  }, [execution, learningContext, loading, messageDraft, question, sendMessage, sending]);

  const handleWebSubmitKey = useCallback((event: TextInputKeyPressEvent) => {
    const nativeEvent = event.nativeEvent;
    if (
      nativeEvent.key !== 'Enter' ||
      ('shiftKey' in nativeEvent && nativeEvent.shiftKey === true)
    ) {
      return;
    }
    event.preventDefault();
    submitDraft();
  }, [submitDraft]);

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
        const savedQuestion = questionResult.data as unknown as PracticeQuestionRecord;
        let selectedAttempt: PracticeAttempt | null = null;
        let attemptNumber = 0;
        if (attemptId) {
          const [attemptResult, attemptCountResult] = await Promise.all([
            supabase
              .from('practice_attempts')
              .select('id,question_id,sql,execution_result,created_at')
              .eq('question_id', questionId)
              .eq('id', attemptId)
              .maybeSingle(),
            supabase
              .from('practice_attempts')
              .select('id', { count: 'exact', head: true })
              .eq('question_id', questionId),
          ]);
          if (attemptResult.error) {
            throw attemptResult.error;
          }
          if (attemptCountResult.error) {
            throw attemptCountResult.error;
          }
          if (!attemptResult.data) {
            throw new Error('The submitted SQL attempt could not be loaded for this question.');
          }
          selectedAttempt = attemptResult.data as PracticeAttempt;
          attemptNumber = attemptCountResult.count ?? 1;
        }
        const loadedQuestion = selectedAttempt
          ? {
              ...savedQuestion,
              draft_sql: selectedAttempt.sql,
              latest_result: selectedAttempt.execution_result,
            }
          : { ...savedQuestion, latest_result: null };
        const loadedSet = setResult.data as PracticeSetHeader;
        const loadedMessages = (messagesResult.data ?? []) as unknown as PracticeConversationMessage[];
        setQuestion(loadedQuestion);
        setSet(loadedSet);
        setAttempt(selectedAttempt);
        updateMessages(loadedMessages);
        const currentExecution = getPracticeEvaluatorExecution(
          loadedQuestion.id,
          loadedQuestion.draft_sql,
          selectedAttempt as PracticeNotesAttempt | null,
        );
        if (currentExecution.status !== 'not_executed') {
          const reviewPrompt = buildPracticeAttemptReviewPrompt(currentExecution.sql, attemptNumber);
          const alreadyReviewed = loadedMessages.some(
            (message) => message.role === 'user' && message.content === reviewPrompt,
          );
          if (!alreadyReviewed) {
            await sendMessage(
              reviewPrompt,
              loadedQuestion,
              getPracticeLearningContext(loadedSet.config),
              currentExecution,
              loadedMessages,
            );
          }
        } else if (loadedMessages.length === 0) {
          await sendMessage(
            firstPrompt,
            loadedQuestion,
            getPracticeLearningContext(loadedSet.config),
            currentExecution,
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
  }, [attemptId, questionId, sendMessage, setId]);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable
          accessibilityLabel="Back to question workspace"
          accessibilityRole="button"
          onPress={() => {
            if (setId && questionId) {
              router.replace(getPracticeEvaluatorBackRoute(setId, questionId));
            } else if (router.canGoBack()) {
              router.back();
            } else {
              router.replace('/sql-practice');
            }
          }}
          style={[styles.backButton, { backgroundColor: colors.surface, borderColor: colors.border }]}>
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
        <View style={styles.scrollControls}>
          <Pressable
            accessibilityLabel="Scroll AI conversation to top"
            accessibilityRole="button"
            onPress={() => messageListRef.current?.scrollTo({ y: 0, animated: true })}
            style={[styles.scrollControl, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <SymbolView
              name={{ ios: 'arrow.up', android: 'arrow_upward', web: 'arrow_upward' }}
              size={18}
              tintColor={colors.primaryText}
            />
          </Pressable>
          <Pressable
            accessibilityLabel="Jump to latest message"
            accessibilityRole="button"
            onPress={scrollToLatestMessage}
            style={[styles.scrollControl, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <SymbolView
              name={{ ios: 'arrow.down', android: 'arrow_downward', web: 'arrow_downward' }}
              size={18}
              tintColor={colors.primaryText}
            />
          </Pressable>
        </View>
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
            onKeyPress={Platform.OS === 'web' ? handleWebSubmitKey : undefined}
            onSubmitEditing={submitDraft}
            onFocus={() => requestAnimationFrame(() => messageListRef.current?.scrollToEnd({ animated: true }))}
            placeholder="Ask about this SQL…"
            placeholderTextColor={colors.mutedText}
            returnKeyType="send"
            submitBehavior="submit"
            style={[styles.input, { color: colors.primaryText }]}
          />
          <Pressable
            accessibilityLabel="Send message"
            accessibilityRole="button"
            disabled={sending || loading || !messageDraft.trim()}
            onPress={submitDraft}
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
    height: 42,
    borderWidth: 1,
    borderRadius: 21,
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
  scrollControls: {
    position: 'absolute',
    bottom: 14,
    right: 12,
    gap: 8,
  },
  scrollControl: {
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
