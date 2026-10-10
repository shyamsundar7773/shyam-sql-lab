export type SqlPracticeDifficulty = 'Beginner' | 'Intermediate' | 'Advanced';
export type SqlPracticeQuestionType = 'SELECT' | 'WHERE' | 'JOIN' | 'GROUP BY' | 'AGGREGATION';
export type SqlPracticeStatus = 'in_progress' | 'completed' | 'needs_review';

export type PracticeTable = {
  name: string;
  columns: { name: string; type: 'TEXT' | 'INTEGER' | 'REAL' | 'BOOLEAN' }[];
  rows: Record<string, string | number | boolean | null>[];
};

export type PracticeQuestionContent = {
  title: string;
  prompt: string;
  explanation: string;
  solutionSql?: string;
  concepts: string[];
  tables: PracticeTable[];
};

export type PracticeQuestionRecord = {
  id: string;
  set_id: string;
  position: number;
  content: PracticeQuestionContent;
  draft_sql: string;
  status: SqlPracticeStatus;
  latest_result: SqlPracticeExecutionResult | null;
  updated_at: string;
};

export type SqlPracticeExecutionResult = {
  ok: boolean;
  columns: string[];
  rows: Record<string, string | number | boolean | null>[];
  rowsAffected?: number;
  errorType?: 'policy' | 'execution' | 'setup';
  rowLimit?: number;
  truncated?: boolean;
  error?: string;
  resolvedQuestion?: PracticeQuestionContent;
};

export type PracticeConversationMessage = {
  id: string;
  question_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
};
