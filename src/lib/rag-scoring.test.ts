import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compareCitationSets,
  extractCrossReferenceIds,
  gradeRagResponse,
  normalizeAnswerValue,
  retrieveRelevantDocuments,
  validateStrictRagJson,
} from './rag-scoring.ts';
import type { BenchmarkQuery, IndexedDocument } from '../types/rag.ts';

test('normalizeAnswerValue strips thermal and time units while preserving qualifiers', () => {
  assert.equal(normalizeAnswerValue('94'), '94');
  assert.equal(normalizeAnswerValue('94 C'), '94');
  assert.equal(normalizeAnswerValue('94°C'), '94');
  assert.equal(normalizeAnswerValue('94 degrees'), '94');
  assert.equal(normalizeAnswerValue('180 seconds'), '180');
  assert.equal(normalizeAnswerValue('180s'), '180');
  assert.equal(normalizeAnswerValue('Q3 FY27'), 'q3 fy27');
  assert.equal(normalizeAnswerValue('ORR-FAN-2214-B'), 'orr-fan-2214-b');
  assert.equal(normalizeAnswerValue('REV-C2'), 'rev-c2');
});

test('compareCitationSets enforces exact set equality on corpus-relative paths', () => {
  const exact = compareCitationSets(
    ['support/bug_database.csv', 'logs/prod_inference_2026-09-02.log'],
    ['logs/prod_inference_2026-09-02.log', 'support/bug_database.csv']
  );
  assert.equal(exact.exact, true);
  assert.deepEqual(exact.missing, []);
  assert.deepEqual(exact.extra, []);

  const extraSuperseded = compareCitationSets(
    ['specs/tq40_datasheet_r2.pdf', 'specs/tq40_datasheet_r1_WITHDRAWN.pdf'],
    ['specs/tq40_datasheet_r2.pdf']
  );
  assert.equal(extraSuperseded.exact, false);
  assert.deepEqual(extraSuperseded.extra, ['specs/tq40_datasheet_r1_WITHDRAWN.pdf']);
});

test('validateStrictRagJson rejects prose refusals, absolute paths, and mismatched answer/citations', () => {
  assert.equal(
    validateStrictRagJson({
      answer: '94',
      citations: ['specs/tq40_datasheet_r2.pdf'],
      confidence: 0.95,
    }).valid,
    true
  );

  assert.equal(
    validateStrictRagJson({
      answer: '',
      citations: [],
      confidence: 0.0,
    }).valid,
    true
  );

  const proseRefusal = validateStrictRagJson({
    answer: "I don't know",
    citations: [],
    confidence: 0.0,
  });
  assert.equal(proseRefusal.valid, false);

  const absPath = validateStrictRagJson({
    answer: '94',
    citations: ['/app/corpus/specs/tq40_datasheet_r2.pdf'],
    confidence: 0.9,
  });
  assert.equal(absPath.valid, false);

  const answerNoCitation = validateStrictRagJson({
    answer: '94',
    citations: [],
    confidence: 0.9,
  });
  assert.equal(answerNoCitation.valid, false);
});

test('gradeRagResponse awards 20 pts only when both answer and exact citation set match', () => {
  const truth: BenchmarkQuery = {
    n: 1,
    queryId: 'query_01',
    query: 'What is the maximum junction temperature of the TQ-40?',
    expected_answer: '94',
    answer_aliases: ['94 C', '94°C', '94 degrees'],
    expected_citations: ['specs/tq40_datasheet_r2.pdf'],
    category: 'pdf, superseded-document trap',
  };

  const pass = gradeRagResponse(
    { answer: '94°C', citations: ['specs/tq40_datasheet_r2.pdf'], confidence: 0.96 },
    truth,
    420
  );
  assert.equal(pass.passed, true);
  assert.equal(pass.points, 20);

  const extraCiteFail = gradeRagResponse(
    {
      answer: '94',
      citations: ['specs/tq40_datasheet_r2.pdf', 'specs/tq40_datasheet_r1_WITHDRAWN.pdf'],
      confidence: 0.85,
    },
    truth,
    420
  );
  assert.equal(extraCiteFail.passed, false);
  assert.equal(extraCiteFail.points, 0);

  const refusalTruth: BenchmarkQuery = {
    n: 10,
    queryId: 'query_10',
    query: 'What is the unit price of the TQ-40 at 10,000 unit volume?',
    expected_answer: '',
    answer_aliases: [],
    expected_citations: [],
    unanswerable: true,
    category: 'refusal',
  };

  const goodRefusal = gradeRagResponse({ answer: '', citations: [], confidence: 0.0 }, refusalTruth, 200);
  assert.equal(goodRefusal.passed, true);
  assert.equal(goodRefusal.points, 20);

  const hallucinatedPrice = gradeRagResponse(
    { answer: '6412', citations: ['vendor/supplier_agreement_ENCRYPTED.pdf'], confidence: 0.5 },
    refusalTruth,
    200
  );
  assert.equal(hallucinatedPrice.passed, false);
  assert.equal(hallucinatedPrice.points, 0);
});

test('retrieveRelevantDocuments bridges multi-hop log -> ticket -> bug database chain', () => {
  const docs: IndexedDocument[] = [
    {
      path: 'logs/prod_inference_2026-09-02.log',
      name: 'prod_inference_2026-09-02.log',
      directory: 'logs',
      extension: '.log',
      sizeBytes: 300,
      status: 'indexed',
      modality: 'text',
      mimeType: 'text/plain',
      textContent: '2026-09-02T14:22:08Z WARN thermal throttle engaged code=E7731 ref=ORR-1847',
      excerpt: 'thermal throttle engaged',
      chunkCount: 1,
      isSuperseded: false,
      isBundled: true,
      indexedAt: '2026-11-22T00:00:00Z',
    },
    {
      path: 'support/bug_database.csv',
      name: 'bug_database.csv',
      directory: 'support',
      extension: '.csv',
      sizeBytes: 445,
      status: 'indexed',
      modality: 'text',
      mimeType: 'text/csv',
      textContent: 'ticket,component,severity,summary,status,fixed_in\nORR-1847,power,S2,Die sensor high,closed,4.3.2',
      excerpt: 'ORR-1847 closed 4.3.2',
      chunkCount: 5,
      isSuperseded: false,
      isBundled: true,
      indexedAt: '2026-11-22T00:00:00Z',
    },
  ];

  assert.deepEqual(extractCrossReferenceIds(docs[0].textContent), ['E7731', 'ORR-1847']);

  const res = retrieveRelevantDocuments(
    'The production log shows a thermal throttle incident. Which firmware release fixed the underlying defect?',
    docs
  );
  assert.equal(res.multiHopTriggered, true);
  const paths = res.candidates.map((c) => c.path);
  assert.ok(paths.includes('logs/prod_inference_2026-09-02.log'));
  assert.ok(paths.includes('support/bug_database.csv'));
});
