export type CorpusFileStatus =
  | 'indexed'
  | 'superseded'
  | 'encrypted'
  | 'unreadable'
  | 'unsupported'
  | 'empty_dir';

export type CorpusModality = 'text' | 'pdf' | 'office' | 'image' | 'binary' | 'directory';

export interface IndexedDocument {
  /** Corpus-relative path using forward slashes, e.g. "specs/tq40_datasheet_r2.pdf" */
  path: string;
  name: string;
  directory: string;
  extension: string;
  sizeBytes: number;
  status: CorpusFileStatus;
  modality: CorpusModality;
  mimeType: string;
  statusReason?: string;
  /** Extracted text content (empty for encrypted/unreadable/unsupported/empty_dir) */
  textContent: string;
  /** Vision/summary description for images or concise excerpt for UI */
  excerpt: string;
  /** Number of logical chunks/rows/lines indexed */
  chunkCount: number;
  /** True if this file is marked withdrawn or superseded */
  isSuperseded: boolean;
  /** True if the file is part of the bundled MC-3 corpus vs user-uploaded */
  isBundled: boolean;
  indexedAt: string;
}

export interface CorpusIndexSummary {
  corpusName: string;
  indexedAt: string;
  durationMs: number;
  totalEntries: number;
  indexedCount: number;
  multimodalCount: number;
  supersededCount: number;
  skippedCount: number;
  documents: IndexedDocument[];
}

export interface StrictRagOutput {
  answer: string;
  citations: string[];
  confidence: number;
}

export interface RetrievalCandidate {
  path: string;
  score: number;
  hop: 1 | 2;
  matchedTerms: string[];
  modality: CorpusModality;
  isSuperseded: boolean;
}

export interface QueryExecutionResult {
  queryId: string;
  query: string;
  output: StrictRagOutput;
  latencyMs: number;
  model: string;
  retrievedCandidates: RetrievalCandidate[];
  multiHopTriggered: boolean;
  schemaValid: boolean;
  schemaErrors: string[];
  timestamp: string;
}

export interface BenchmarkQuery {
  n: number;
  queryId: string;
  query: string;
  expected_answer: string;
  answer_aliases: string[];
  expected_citations: string[];
  unanswerable?: boolean;
  category: string;
  note?: string;
}

export interface CitationDiff {
  exact: boolean;
  missing: string[];
  extra: string[];
}

export interface BenchmarkGradeResult {
  queryId: string;
  n: number;
  query: string;
  category: string;
  expectedAnswer: string;
  expectedCitations: string[];
  actual: StrictRagOutput;
  answerMatch: boolean;
  citationDiff: CitationDiff;
  passed: boolean;
  points: number;
  maxPoints: number;
  latencyMs: number;
  failureReason?: string;
}
