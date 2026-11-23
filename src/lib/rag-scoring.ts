import type {
  BenchmarkGradeResult,
  BenchmarkQuery,
  CitationDiff,
  IndexedDocument,
  RetrievalCandidate,
  StrictRagOutput,
} from '../types/rag.ts';

const PROSE_REFUSAL_PATTERNS = [
  /^i\s+don'?t\s+know/i,
  /^not\s+found/i,
  /^unknown$/i,
  /^n\/?a$/i,
  /^cannot\s+answer/i,
  /^unanswerable/i,
  /^the\s+corpus\s+does\s+not/i,
  /^no\s+information/i,
];

/**
 * Normalizes a corpus-relative path to forward slashes without leading "./" or "/".
 */
export function normalizeCitationPath(raw: string): string {
  return raw
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/app\/corpus\//, '')
    .replace(/^\.\//, '')
    .replace(/^\/+/, '');
}

/**
 * Normalizes an extracted answer value according to MC-3 grading rules:
 * strips trailing unit/degree qualifiers (C, °C, degrees, seconds, s),
 * collapses internal whitespace, and compares case-insensitively.
 */
export function normalizeAnswerValue(raw: string): string {
  let s = raw.trim();
  if (!s) return '';

  // Strip surrounding quotes if any
  s = s.replace(/^["']+|["']+$/g, '').trim();

  // Normalize degree symbols and thermal units: "94°C", "94 C", "94 degrees", "94 deg C"
  s = s.replace(/\s*(?:°\s*c|deg(?:rees?)?\s*c?|degrees?|\u00b0c?)\s*$/i, '');

  // Strip bare trailing "C" only when preceded by a numeric value + space (e.g. "94 C")
  s = s.replace(/^(-?\d+(?:\.\d+)?)\s+c$/i, '$1');

  // Normalize seconds units: "180s", "180 seconds", "180 sec"
  s = s.replace(/^(-?\d+(?:\.\d+)?)\s*(?:seconds?|secs?|s)$/i, '$1');

  // Collapse whitespace
  s = s.replace(/\s+/g, ' ').trim();

  return s.toLowerCase();
}

/**
 * Compares actual vs expected citation sets strictly as exact sets.
 */
export function compareCitationSets(actual: string[], expected: string[]): CitationDiff {
  const normActual = Array.from(new Set(actual.map(normalizeCitationPath).filter(Boolean))).sort();
  const normExpected = Array.from(new Set(expected.map(normalizeCitationPath).filter(Boolean))).sort();

  const actualSet = new Set(normActual);
  const expectedSet = new Set(normExpected);

  const missing = normExpected.filter((p) => !actualSet.has(p));
  const extra = normActual.filter((p) => !expectedSet.has(p));

  return {
    exact: missing.length === 0 && extra.length === 0,
    missing,
    extra,
  };
}

/**
 * Validates that a JSON payload adheres strictly to the Enterprise RAG schema:
 * { "answer": string, "citations": string[], "confidence": number in [0, 1] }
 */
export function validateStrictRagJson(raw: unknown): {
  valid: boolean;
  errors: string[];
  parsed?: StrictRagOutput;
} {
  const errors: string[] = [];

  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { valid: false, errors: ['Output must be a JSON object'] };
  }

  const obj = raw as Record<string, unknown>;

  if (typeof obj.answer !== 'string') {
    errors.push('Missing or non-string "answer" field');
  }

  if (!Array.isArray(obj.citations) || !obj.citations.every((c) => typeof c === 'string')) {
    errors.push('Missing or invalid "citations" array of string paths');
  }

  if (
    typeof obj.confidence !== 'number' ||
    Number.isNaN(obj.confidence) ||
    obj.confidence < 0 ||
    obj.confidence > 1
  ) {
    errors.push('"confidence" must be a number between 0 and 1');
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  const answer = (obj.answer as string).trim();
  const citations = Array.from(
    new Set((obj.citations as string[]).map((c) => c.trim()).filter(Boolean))
  );
  const confidence = Number((obj.confidence as number).toFixed(2));

  for (const c of citations) {
    if (c.startsWith('/') || c.includes('..')) {
      errors.push(`Citation "${c}" must be a corpus-relative path`);
    }
  }

  if (answer && citations.length === 0) {
    errors.push('Non-empty answer must include at least one necessary citation');
  }

  if (!answer && citations.length > 0) {
    errors.push('Refusal (empty answer) must have an empty citations array');
  }

  if (PROSE_REFUSAL_PATTERNS.some((re) => re.test(answer))) {
    errors.push('Refusals must return an empty string "", never prose such as "I don\'t know"');
  }

  return {
    valid: errors.length === 0,
    errors,
    parsed: { answer, citations, confidence },
  };
}

/**
 * Grades a strict RAG output against an MC-3 benchmark ground truth item.
 * Awards 20 points ONLY if BOTH answer and exact citation set match (0 partial credit).
 */
export function gradeRagResponse(
  actual: StrictRagOutput,
  truth: BenchmarkQuery,
  latencyMs: number
): BenchmarkGradeResult {
  const citationDiff = compareCitationSets(actual.citations, truth.expected_citations);
  const normActual = normalizeAnswerValue(actual.answer);

  let answerMatch = false;
  if (truth.unanswerable || truth.expected_answer === '') {
    answerMatch = actual.answer.trim() === '';
  } else {
    const accepted = [truth.expected_answer, ...(truth.answer_aliases ?? [])].map(
      normalizeAnswerValue
    );
    const compactActual = normActual.replace(/\s+/g, '');
    answerMatch = accepted.some(
      (candidate) =>
        candidate === normActual ||
        (candidate.length > 0 && candidate.replace(/\s+/g, '') === compactActual)
    );
  }

  const passed = answerMatch && citationDiff.exact;
  let failureReason: string | undefined;
  if (!passed) {
    const reasons: string[] = [];
    if (!answerMatch) {
      reasons.push(
        truth.unanswerable
          ? `Expected refusal "", got "${actual.answer}"`
          : `Expected "${truth.expected_answer}", got "${actual.answer}"`
      );
    }
    if (!citationDiff.exact) {
      if (citationDiff.missing.length > 0) {
        reasons.push(`Missing citations: ${citationDiff.missing.join(', ')}`);
      }
      if (citationDiff.extra.length > 0) {
        reasons.push(`Unnecessary citations: ${citationDiff.extra.join(', ')}`);
      }
    }
    failureReason = reasons.join('; ');
  }

  return {
    queryId: truth.queryId,
    n: truth.n,
    query: truth.query,
    category: truth.category,
    expectedAnswer: truth.expected_answer,
    expectedCitations: truth.expected_citations,
    actual,
    answerMatch,
    citationDiff,
    passed,
    points: passed ? 20 : 0,
    maxPoints: 20,
    latencyMs,
    failureReason,
  };
}

const STOPWORDS = new Set([
  'the', 'is', 'in', 'of', 'for', 'to', 'a', 'an', 'on', 'at', 'by', 'and', 'or',
  'what', 'which', 'when', 'where', 'who', 'how', 'does', 'do', 'did', 'be', 'are',
  'was', 'were', 'has', 'have', 'that', 'this', 'with', 'from', 'it', 'its', 'as',
]);

export function tokenizeForSearch(text: string): string[] {
  const rawTokens = text
    .toLowerCase()
    .split(/[^a-z0-9#._-]+/)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
  return Array.from(new Set(rawTokens));
}

/**
 * Extracts structured cross-reference identifiers (tickets like ORR-1847,
 * error codes like E7731, part numbers like ORR-FAN-2214-B, models like TQ-40)
 * from text to enable deterministic multi-hop document expansion.
 */
export function extractCrossReferenceIds(text: string): string[] {
  const matches = text.match(/\b(?:ORR-\d{3,6}|ORR-[A-Z]+-\d+-[A-Z0-9]+|E\d{4}|TQ-\d{2}|REV-[A-Z0-9]+)\b/gi);
  if (!matches) return [];
  return Array.from(new Set(matches.map((m) => m.toUpperCase())));
}

/**
 * Deterministic 2-hop hybrid lexical + entity retriever over indexed corpus documents.
 * Hop 1: scores all readable indexed documents against query tokens & path tokens.
 * Hop 2: extracts cross-reference IDs (tickets/error codes) from top Hop-1 hits
 *        and expands retrieval to linked documents (e.g., prod log -> ORR-1847 -> bug_database.csv).
 */
export function retrieveRelevantDocuments(
  query: string,
  documents: IndexedDocument[],
  maxResults = 8
): { candidates: RetrievalCandidate[]; multiHopTriggered: boolean } {
  const readableDocs = documents.filter(
    (d) => d.status === 'indexed' || d.status === 'superseded'
  );
  const queryTokens = tokenizeForSearch(query);
  const queryIds = extractCrossReferenceIds(query);

  const hop1Scores = new Map<string, { score: number; matched: Set<string>; doc: IndexedDocument }>();

  for (const doc of readableDocs) {
    const haystack = `${doc.path} ${doc.textContent} ${doc.excerpt}`.toLowerCase();
    const pathLower = doc.path.toLowerCase();
    let score = 0;
    const matched = new Set<string>();

    for (const token of queryTokens) {
      if (pathLower.includes(token)) {
        score += 3.5;
        matched.add(token);
      }
      if (haystack.includes(token)) {
        score += 2.0;
        matched.add(token);
      }
    }

    for (const id of queryIds) {
      if (haystack.includes(id.toLowerCase())) {
        score += 8.0;
        matched.add(id);
      }
    }

    // Visual/image boost when query mentions visual/hardware-label cues
    if (
      doc.modality === 'image' &&
      /\b(pin|pinout|backplane|label|sticker|printed|revision|barcode|diagram|connector|asset|serial|therm_alert)\b/i.test(
        query
      )
    ) {
      score += 4.5;
      matched.add('visual-cue');
    }

    // Slight penalty for explicitly superseded/withdrawn documents so canonical revision ranks first
    if (doc.isSuperseded) {
      score *= 0.65;
    }

    if (score > 0) {
      hop1Scores.set(doc.path, { score, matched, doc });
    }
  }

  const sortedHop1 = Array.from(hop1Scores.values()).sort((a, b) => b.score - a.score);

  // Hop 2: Extract cross-reference IDs from top 3 Hop-1 docs to bridge multi-hop chains
  const bridgedIds = new Set<string>();
  for (const entry of sortedHop1.slice(0, 3)) {
    const ids = extractCrossReferenceIds(entry.doc.textContent);
    for (const id of ids) {
      // Skip overly generic model numbers like TQ-40 as hop bridges
      if (!/^TQ-\d+$/i.test(id)) {
        bridgedIds.add(id);
      }
    }
  }

  const hop2Map = new Map<string, { score: number; matched: Set<string>; doc: IndexedDocument }>();
  let multiHopTriggered = false;

  if (bridgedIds.size > 0) {
    for (const doc of readableDocs) {
      const contentUpper = doc.textContent.toUpperCase();
      const matchedBridgeIds: string[] = [];
      for (const id of bridgedIds) {
        if (contentUpper.includes(id)) {
          matchedBridgeIds.push(id);
        }
      }
      if (matchedBridgeIds.length > 0 && !hop1Scores.has(doc.path)) {
        multiHopTriggered = true;
        hop2Map.set(doc.path, {
          score: 7.5 * matchedBridgeIds.length,
          matched: new Set(matchedBridgeIds),
          doc,
        });
      } else if (matchedBridgeIds.length > 0 && hop1Scores.has(doc.path)) {
        const existing = hop1Scores.get(doc.path)!;
        // Boost existing hit if another top document cross-references it
        if (!sortedHop1.slice(0, 1).some((h) => h.doc.path === doc.path)) {
          multiHopTriggered = true;
          existing.score += 5.0 * matchedBridgeIds.length;
          for (const id of matchedBridgeIds) existing.matched.add(id);
        }
      }
    }
  }

  const combined: RetrievalCandidate[] = [
    ...Array.from(hop1Scores.values()).map((entry) => ({
      path: entry.doc.path,
      score: Number(entry.score.toFixed(2)),
      hop: 1 as const,
      matchedTerms: Array.from(entry.matched),
      modality: entry.doc.modality,
      isSuperseded: entry.doc.isSuperseded,
    })),
    ...Array.from(hop2Map.values()).map((entry) => ({
      path: entry.doc.path,
      score: Number(entry.score.toFixed(2)),
      hop: 2 as const,
      matchedTerms: Array.from(entry.matched),
      modality: entry.doc.modality,
      isSuperseded: entry.doc.isSuperseded,
    })),
  ];

  combined.sort((a, b) => b.score - a.score);

  return {
    candidates: combined.slice(0, maxResults),
    multiHopTriggered,
  };
}
