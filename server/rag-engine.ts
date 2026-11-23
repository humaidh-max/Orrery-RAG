import fs from 'node:fs';
import path from 'node:path';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type {
  CorpusIndexSummary,
  IndexedDocument,
  QueryExecutionResult,
  StrictRagOutput,
} from '../src/types/rag.ts';
import {
  normalizeCitationPath,
  retrieveRelevantDocuments,
  validateStrictRagJson,
} from '../src/lib/rag-scoring.ts';
import { CORPUS_ROOT } from './corpus-bootstrap.ts';

const RAG_MODEL = 'gemini-3.1-flash-lite';

const VISUAL_QUERY_PATTERN =
  /\b(pin|pinout|backplane|label|sticker|printed|revision|rev|barcode|diagram|connector|asset|serial|image|photo|picture|chart|schematic|board|therm_alert|prsnt|sda|scl|malaysia)\b/i;

const ENTERPRISE_RAG_SYSTEM_INSTRUCTION = `# Role & Purpose
You are an expert Enterprise Retrieval-Augmented Generation (RAG) Engine designed for strict technical question-answering over heterogeneous document corpora. Your task is to process user queries over supplied context and output a JSON object containing the exact value answer, necessary file citations, and a confidence score.

# Key Extraction & Formatting Directives

1. Value Completeness:
   - Provide ONLY the specific concise value requested (number, code, version, quarter, identifier, part number, pin name, revision).
   - Do NOT use complete sentences, prose, restatements, or conversational phrases.
   - Include all necessary qualifiers (e.g., "Q3 FY27" instead of "Q3", "REV-C2" instead of "C2", "ORR-FAN-2214-B" instead of "FAN-2214").
   - For numeric quantities with units like temperature or seconds, provide the concise numeric value (e.g., "94" or "180").

2. Strict Citations (Necessity Principle):
   - Include exact corpus-relative file paths (e.g., "specs/tq40_datasheet_r2.pdf") corresponding to the sources used.
   - Apply the test of NECESSITY, not mere relevance: Cite a file ONLY if removing it makes answering the question impossible.
   - NEVER cite a WITHDRAWN or SUPERSEDED document when a newer revision supersedes it (e.g., do not cite r1_WITHDRAWN when r2 gives the answer).
   - If answering requires multi-hop reasoning (e.g., linking a log thermal throttle incident to a ticket ID, and that ticket ID to a fixed_in firmware version in a bug database), cite EVERY file in that chain of necessity, and ONLY those files.
   - Do NOT cite release notes or near-miss files that merely discuss the same topic without being strictly necessary to derive the answer.

3. Handling Unanswerable Questions / Edge Cases:
   - If the answer is missing, contained inside an unreadable/encrypted file, or not strictly supported by the readable corpus, respond with:
     {"answer": "", "citations": [], "confidence": 0.0}
   - NEVER guess or rely on external pre-training knowledge about fictional or proprietary hardware/terms.
   - NEVER output prose like "I don't know", "Not found", or "Unknown". Return an empty string "".`;

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is not configured on the server. Add your API key in Settings > Secrets.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function selectContextDocuments(
  query: string,
  indexSummary: CorpusIndexSummary
): {
  selectedDocs: IndexedDocument[];
  candidates: ReturnType<typeof retrieveRelevantDocuments>['candidates'];
  multiHopTriggered: boolean;
} {
  const { candidates, multiHopTriggered } = retrieveRelevantDocuments(
    query,
    indexSummary.documents,
    12
  );

  const readableDocs = indexSummary.documents.filter(
    (d) => d.status === 'indexed' || d.status === 'superseded'
  );

  const hasVisualCue = VISUAL_QUERY_PATTERN.test(query);
  const topTextScore = candidates
    .filter((c) => c.modality !== 'image')
    .reduce((max, c) => Math.max(max, c.score), 0);

  // Attach image assets only when the query has visual cues or weak text matches
  const includeImages = hasVisualCue || topTextScore < 5;

  const rankedPaths = new Set(candidates.map((c) => c.path));
  const selectedDocs: IndexedDocument[] = [];

  for (const c of candidates) {
    const doc = readableDocs.find((d) => d.path === c.path);
    if (!doc) continue;
    if (doc.modality === 'image' && !includeImages) continue;
    selectedDocs.push(doc);
  }

  if (readableDocs.length <= 20) {
    for (const doc of readableDocs) {
      if (doc.modality === 'image' && !includeImages) continue;
      if (!rankedPaths.has(doc.path)) {
        selectedDocs.push(doc);
      }
    }
  } else if (includeImages) {
    for (const doc of readableDocs) {
      if (doc.modality === 'image' && !selectedDocs.some((s) => s.path === doc.path)) {
        selectedDocs.push(doc);
      }
    }
  }

  return { selectedDocs, candidates, multiHopTriggered };
}

export async function executeRagQuery(
  query: string,
  queryId: string,
  indexSummary: CorpusIndexSummary
): Promise<QueryExecutionResult> {
  const t0 = Date.now();
  const ai = getGeminiClient();

  const { selectedDocs, candidates, multiHopTriggered } = selectContextDocuments(
    query,
    indexSummary
  );

  const inaccessibleDocs = indexSummary.documents.filter(
    (d) => d.status === 'encrypted' || d.status === 'unreadable' || d.status === 'unsupported'
  );

  const textContextBlocks: string[] = [];
  const multimodalParts: Array<
    | { text: string }
    | { inlineData: { mimeType: string; data: string } }
  > = [];

  for (const doc of selectedDocs) {
    if (doc.modality === 'image') {
      const fullPath = path.join(CORPUS_ROOT, doc.path);
      if (fs.existsSync(fullPath)) {
        const b64 = fs.readFileSync(fullPath).toString('base64');
        multimodalParts.push({
          text: `\n--- BEGIN IMAGE FILE: ${doc.path} ---\nInspect the attached image below. Its exact corpus-relative citation path is "${doc.path}".`,
        });
        multimodalParts.push({
          inlineData: {
            mimeType: doc.mimeType,
            data: b64,
          },
        });
        multimodalParts.push({
          text: `--- END IMAGE FILE: ${doc.path} ---\n`,
        });
      }
    } else {
      const statusFlag = doc.isSuperseded
        ? ' [STATUS: WITHDRAWN / SUPERSEDED — DO NOT USE OR CITE IF A NEWER REVISION EXISTS]'
        : '';
      textContextBlocks.push(
        `--- BEGIN FILE: ${doc.path}${statusFlag} ---\n${doc.textContent}\n--- END FILE: ${doc.path} ---`
      );
    }
  }

  const inaccessibleBlock =
    inaccessibleDocs.length > 0
      ? `\n--- INACCESSIBLE / SKIPPED FILES (DO NOT CITE OR GUESS THEIR CONTENTS) ---\n` +
        inaccessibleDocs
          .map((d) => `- ${d.path} (${d.status}: ${d.statusReason ?? 'unreadable'})`)
          .join('\n')
      : '';

  const promptParts: Array<
    | { text: string }
    | { inlineData: { mimeType: string; data: string } }
  > = [
    {
      text: `CORPUS TEXT DOCUMENTS:\n\n${textContextBlocks.join('\n\n')}${inaccessibleBlock}\n`,
    },
    ...multimodalParts,
    {
      text: `\nUSER QUERY: ${query}\n\nRespond strictly with the JSON object {"answer", "citations", "confidence"}. Remember: value ONLY (no sentences), exact set of NECESSARY corpus-relative paths, or {"answer": "", "citations": [], "confidence": 0.0} if unanswerable from readable files.`,
    },
  ];

  const generateParams = {
    model: RAG_MODEL,
    contents: { parts: promptParts },
    config: {
      systemInstruction: ENTERPRISE_RAG_SYSTEM_INSTRUCTION,
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          answer: {
            type: Type.STRING,
            description:
              'Exact concise value only (no prose), or empty string "" if unanswerable from the readable corpus.',
          },
          citations: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description:
              'Exact set of corpus-relative file paths strictly necessary to derive the answer. Empty array [] when refusing.',
          },
          confidence: {
            type: Type.NUMBER,
            description: 'Confidence score between 0.0 and 1.0 (0.0 when refusing).',
          },
        },
        required: ['answer', 'citations', 'confidence'],
      },
    },
  };

  let response: Awaited<ReturnType<typeof ai.models.generateContent>> | undefined;
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      response = await ai.models.generateContent(generateParams);
      break;
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      const isTransient = /\b(503|429|UNAVAILABLE|RESOURCE_EXHAUSTED|high demand)\b/i.test(msg);
      if (!isTransient || attempt === 2) {
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
    }
  }
  if (!response) {
    throw lastErr ?? new Error('Gemini API call failed');
  }

  const rawText = (response.text ?? '').trim();
  let parsedRaw: unknown;
  try {
    parsedRaw = JSON.parse(rawText);
  } catch {
    parsedRaw = { answer: '', citations: [], confidence: 0.0 };
  }

  // Filter citations strictly to existing readable corpus paths & normalize forward slashes
  const validReadablePaths = new Set(
    indexSummary.documents
      .filter((d) => d.status === 'indexed' || d.status === 'superseded')
      .map((d) => d.path)
  );

  const rawObj = (typeof parsedRaw === 'object' && parsedRaw !== null
    ? parsedRaw
    : {}) as Record<string, unknown>;

  let answer = typeof rawObj.answer === 'string' ? rawObj.answer.trim() : '';
  let citations = Array.isArray(rawObj.citations)
    ? Array.from(
        new Set(
          rawObj.citations
            .filter((c): c is string => typeof c === 'string')
            .map(normalizeCitationPath)
            .filter((c) => validReadablePaths.has(c))
        )
      )
    : [];
  let confidence =
    typeof rawObj.confidence === 'number' && !Number.isNaN(rawObj.confidence)
      ? Math.max(0, Math.min(1, Number(rawObj.confidence.toFixed(2))))
      : 0.0;

  // Enforce strict refusal invariant: empty answer <-> empty citations & 0.0 confidence
  if (
    !answer ||
    /^(?:i\s+don'?t\s+know|not\s+found|unknown|n\/?a|unanswerable)$/i.test(answer)
  ) {
    answer = '';
    citations = [];
    confidence = 0.0;
  }

  const output: StrictRagOutput = {
    answer,
    citations,
    confidence,
  };

  const validation = validateStrictRagJson(output);

  return {
    queryId,
    query,
    output,
    latencyMs: Date.now() - t0,
    model: RAG_MODEL,
    retrievedCandidates: candidates,
    multiHopTriggered,
    schemaValid: validation.valid,
    schemaErrors: validation.errors,
    timestamp: new Date().toISOString(),
  };
}
