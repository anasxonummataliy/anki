import { table, integer, text, boolean, json, index, sql } from 'sdk/db';

export const baskets = table('baskets', {
  id:          integer('id').primaryKey({ autoIncrement: true }),
  name:        text('name').notNull(),
  description: text('description'),
  createdAt:   integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
  updatedAt:   integer('updated_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
}, (t) => ({
  nameIdx: index('idx_baskets_name').on(t.name),
}));

export const vocabulary = table('vocabulary', {
  id:              integer('id').primaryKey({ autoIncrement: true }),
  basketId:        integer('basket_id').notNull(),
  word:            text('word').notNull(),
  translation:     text('translation').notNull(),
  definition:      text('definition'),
  exampleSentence: text('example_sentence'),
  notes:           text('notes'),
  createdAt:       integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
  updatedAt:       integer('updated_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
}, (t) => ({
  basketWordIdx: index('idx_vocab_basket_word').on(t.basketId, t.word),
}));

export const userProgress = table('user_progress', {
  id:             integer('id').primaryKey({ autoIncrement: true }),
  userId:         integer('user_id').notNull(),
  vocabularyId:   integer('vocabulary_id').notNull(),
  status:         text('status').notNull().default('review'),
  timesReviewed:  integer('times_reviewed').notNull().default(0),
  lastReviewedAt: integer('last_reviewed_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
  updatedAt:      integer('updated_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
}, (t) => ({
  userVocabIdx:  index('idx_user_progress_user_vocab').on(t.userId, t.vocabularyId),
  userStatusIdx: index('idx_user_progress_status').on(t.userId, t.status),
}));

export const testAttempts = table('test_attempts', {
  id:               integer('id').primaryKey({ autoIncrement: true }),
  userId:           integer('user_id').notNull(),
  basketId:         integer('basket_id').notNull(),
  totalQuestions:   integer('total_questions').notNull(),
  correctAnswers:   integer('correct_answers').notNull().default(0),
  incorrectAnswers: integer('incorrect_answers').notNull().default(0),
  scorePercentage:  integer('score_percentage').notNull().default(0),
  direction:        text('direction').notNull().default('eng_uzb'),
  status:           text('status').notNull().default('in_progress'),
  startedAt:        integer('started_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
  completedAt:      integer('completed_at', { mode: 'timestamp' }),
}, (t) => ({
  userAttemptsIdx: index('idx_test_attempts_user').on(t.userId),
}));

export const testAnswers = table('test_answers', {
  id:             integer('id').primaryKey({ autoIncrement: true }),
  attemptId:      integer('attempt_id').notNull(),
  vocabularyId:   integer('vocabulary_id').notNull(),
  selectedAnswer: text('selected_answer'),
  correctAnswer:  text('correct_answer').notNull(),
  isCorrect:      boolean('is_correct').notNull().default(false),
  createdAt:      integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
}, (t) => ({
  attemptIdx: index('idx_test_answers_attempt').on(t.attemptId),
}));

export const userSessions = table('user_sessions', {
  id:        integer('id').primaryKey({ autoIncrement: true }),
  userId:    integer('user_id').notNull().unique(),
  state:     text('state').notNull().default('idle'),
  data:      json('data'),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
});

export const activePolls = table('active_polls', {
  pollId:          text('poll_id').primaryKey(),
  userId:          integer('user_id').notNull(),
  attemptId:       integer('attempt_id').notNull(),
  vocabularyId:    integer('vocabulary_id').notNull(),
  questionIndex:   integer('question_index').notNull(),
  correctOptionId: integer('correct_option_id').notNull(),
  correctAnswer:   text('correct_answer').notNull(),
  options:         json('options'),
  chatId:          integer('chat_id').notNull(),
  messageId:       integer('message_id').notNull(),
  status:          text('status').notNull().default('active'),
  createdAt:       integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
}, (t) => ({
  userPollIdx: index('idx_active_polls_user').on(t.userId, t.status),
}));
