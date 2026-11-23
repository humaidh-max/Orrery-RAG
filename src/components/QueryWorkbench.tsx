import { useState, type FormEvent } from 'react';
import {
  Check,
  Copy,
  Download,
  FileCode2,
  Loader2,
  Play,
  AlertCircle,
} from 'lucide-react';
import type {
  CorpusIndexSummary,
  IndexedDocument,
  QueryExecutionResult,
} from '../types/rag';
import { DocumentPreviewPane } from './DocumentPreviewPane';

interface QueryWorkbenchProps {
  corpus: CorpusIndexSummary | null;
  history: QueryExecutionResult[];
  activeResult: QueryExecutionResult | null;
  onExecuteQuery: (query: string, queryId: string) => Promise<void>;
  onSelectHistory: (result: QueryExecutionResult) => void;
  isQuerying: boolean;
  errorMessage: string | null;
}

const PRESET_QUERIES: Array<{
  label: string;
  queryId: string;
  query: string;
}> = [
  {
    label: 'Junction temp (PDF)',
    queryId: 'query_01',
    query: 'What is the maximum junction temperature of the TQ-40?',
  },
  {
    label: 'Thermal fix (2-hop)',
    queryId: 'query_09',
    query:
      'The production log shows a thermal throttle incident. Which firmware release fixed the underlying defect?',
  },
  {
    label: 'THERM_ALERT# pin (PNG)',
    queryId: 'query_07',
    query: 'Which backplane pin carries THERM_ALERT# on the TQ-40?',
  },
  {
    label: 'Board revision (JPG)',
    queryId: 'query_08',
    query: 'What board revision is printed on the asset label?',
  },
  {
    label: 'Fan FRU part (XLSX)',
    queryId: 'query_03',
    query: 'What is the part number of the field-replaceable fan assembly for the TQ-40?',
  },
  {
    label: 'Unit price (Refusal)',
    queryId: 'query_10',
    query: 'What is the unit price of the TQ-40 at 10,000 unit volume?',
  },
];

export function QueryWorkbench({
  corpus,
  history,
  activeResult,
  onExecuteQuery,
  onSelectHistory,
  isQuerying,
  errorMessage,
}: QueryWorkbenchProps) {
  const [queryText, setQueryText] = useState(
    'What is the maximum junction temperature of the TQ-40?'
  );
  const [queryId, setQueryId] = useState('query_01');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [inspectorTab, setInspectorTab] = useState<'evidence' | 'retrieval' | 'history'>('evidence');
  const [inspectedPath, setInspectedPath] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = queryText.trim();
    if (!trimmed) {
      setValidationError('Enter a technical question before running the query.');
      return;
    }
    setValidationError(null);
    setInspectedPath(null);
    await onExecuteQuery(trimmed, queryId.trim() || 'query_01');
  };

  const handlePresetClick = (preset: (typeof PRESET_QUERIES)[number]) => {
    setQueryText(preset.query);
    setQueryId(preset.queryId);
    setValidationError(null);
  };

  const formattedStrictJson = activeResult
    ? JSON.stringify(activeResult.output, null, 2)
    : null;

  const handleCopyJson = async () => {
    if (!formattedStrictJson) return;
    try {
      await navigator.clipboard.writeText(formattedStrictJson);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard may be blocked in headless mode
    }
  };

  const handleDownloadJson = () => {
    if (!activeResult || !formattedStrictJson) return;
    const blob = new Blob([formattedStrictJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeResult.queryId}_output.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const resolvedInspectPath =
    inspectedPath ?? activeResult?.output.citations[0] ?? activeResult?.retrievedCandidates[0]?.path ?? null;

  const inspectedDoc: IndexedDocument | null =
    corpus?.documents.find((d) => d.path === resolvedInspectPath) ?? null;

  const isRefusal =
    activeResult !== null &&
    activeResult.output.answer === '' &&
    activeResult.output.citations.length === 0;

  return (
    <div className="space-y-6">
      {/* Query Input Section */}
      <section
        aria-label="Query input"
        className="bg-white border border-slate-200 rounded-lg p-5 space-y-4"
      >
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            <div className="md:col-span-9 space-y-1.5">
              <label
                htmlFor="rag-query-input"
                className="block text-sm font-semibold text-slate-900"
              >
                Technical Query
              </label>
              <textarea
                id="rag-query-input"
                rows={2}
                value={queryText}
                onChange={(e) => {
                  setQueryText(e.target.value);
                  if (validationError) setValidationError(null);
                }}
                placeholder="Ask a strict technical question over the indexed corpus..."
                className="w-full rounded-md border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15 resize-y"
              />
            </div>

            <div className="md:col-span-3 space-y-1.5">
              <label
                htmlFor="rag-query-id"
                className="block text-sm font-semibold text-slate-900"
              >
                Query ID Stem
              </label>
              <input
                id="rag-query-id"
                type="text"
                value={queryId}
                onChange={(e) => setQueryId(e.target.value)}
                placeholder="query_01"
                className="w-full rounded-md border border-slate-300 bg-white px-3.5 py-2.5 font-mono text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15"
              />
              <p className="text-xs text-slate-500 font-mono truncate">
                {`${queryId.trim() || 'query_01'}_output.json`}
              </p>
            </div>
          </div>

          {validationError && (
            <div
              role="alert"
              className="flex items-center gap-2 text-xs text-red-700 font-medium"
            >
              <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{validationError}</span>
            </div>
          )}

          {errorMessage && (
            <div
              role="alert"
              className="p-3 rounded-md bg-red-50 border border-red-200 flex items-start gap-2.5 text-xs text-red-800"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-1 border-t border-slate-100">
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Sample technical queries">
              {PRESET_QUERIES.map((preset) => (
                <button
                  key={preset.queryId}
                  type="button"
                  onClick={() => handlePresetClick(preset)}
                  className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 hover:text-slate-900 rounded-md transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-blue-600"
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <button
              type="submit"
              disabled={isQuerying}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-60 rounded-md transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-blue-600"
            >
              {isQuerying ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                  <span>Querying Corpus...</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" aria-hidden="true" />
                  <span>Execute Query</span>
                </>
              )}
            </button>
          </div>
        </form>
      </section>

      {/* Output & Evidence 2-Column Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Left: Strict JSON Output & Necessity Citations */}
        <section
          aria-label="Strict JSON response"
          className="lg:col-span-7 bg-white border border-slate-200 rounded-lg p-5 flex flex-col justify-between space-y-5"
        >
          {isQuerying ? (
            <div className="space-y-4 py-4" aria-busy="true">
              <div className="h-4 w-36 bg-slate-200 rounded animate-pulse" />
              <div className="h-12 w-2/3 bg-slate-100 rounded animate-pulse" />
              <div className="h-32 w-full bg-slate-100 rounded animate-pulse" />
            </div>
          ) : !activeResult ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-14 px-4 space-y-2">
              <FileCode2 className="w-7 h-7 text-slate-400" aria-hidden="true" />
              <h2 className="font-display text-base font-semibold text-slate-900">
                Ready for Strict Technical Extraction
              </h2>
              <p className="text-sm text-slate-500 max-w-md">
                Select a preset test query or enter a custom question to generate a schema-validated
                JSON payload with necessity-principle citations.
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Extracted Value Header */}
              <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-slate-200">
                <div className="space-y-1">
                  <p className="text-xs font-medium text-slate-500">Extracted Value</p>
                  {isRefusal ? (
                    <div className="space-y-1">
                      <p
                        data-testid="extracted-answer-value"
                        className="font-mono text-xl font-semibold text-amber-800"
                      >
                        &quot;&quot;
                      </p>
                      <p className="text-xs text-amber-700">
                        Considered Refusal — answer unavailable in readable corpus.
                      </p>
                    </div>
                  ) : (
                    <p
                      data-testid="extracted-answer-value"
                      className="font-mono text-2xl font-semibold tracking-tight text-slate-900"
                    >
                      {activeResult.output.answer}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-3 text-xs text-slate-500 font-mono tabular-nums">
                  <span>
                    Confidence{' '}
                    <strong className="text-slate-900">
                      {activeResult.output.confidence.toFixed(2)}
                    </strong>
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{activeResult.latencyMs} ms</span>
                  <span aria-hidden="true">·</span>
                  <span className={activeResult.schemaValid ? 'text-emerald-700 font-medium' : 'text-red-700 font-medium'}>
                    {activeResult.schemaValid ? 'Schema Valid' : 'Schema Violation'}
                  </span>
                </div>
              </div>

              {/* Strict JSON Payload Block */}
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-slate-900 whitespace-nowrap">
                    Strict JSON Output
                  </h2>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleCopyJson}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-blue-600"
                    >
                      {copied ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-700" aria-hidden="true" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Copy JSON</span>
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={handleDownloadJson}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-blue-600"
                    >
                      <Download className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Download JSON</span>
                    </button>
                  </div>
                </div>

                <pre
                  data-testid="strict-json-output"
                  className="p-4 rounded-md bg-slate-900 text-slate-100 font-mono text-xs leading-relaxed overflow-x-auto"
                >
                  {formattedStrictJson}
                </pre>
              </div>

              {/* Necessity-Principle Citations */}
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-900">
                    Necessity Citations ({activeResult.output.citations.length})
                  </h3>
                  {activeResult.multiHopTriggered && activeResult.output.citations.length > 1 && (
                    <span className="text-xs font-medium text-blue-700">
                      Multi-hop dependency chain
                    </span>
                  )}
                </div>

                {activeResult.output.citations.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    No citations returned (empty set required for unanswerable queries).
                  </p>
                ) : (
                  <ul className="divide-y divide-slate-200 border border-slate-200 rounded-md">
                    {activeResult.output.citations.map((citePath) => {
                      const isSelected = resolvedInspectPath === citePath;
                      const doc = corpus?.documents.find((d) => d.path === citePath);
                      return (
                        <li key={citePath}>
                          <button
                            type="button"
                            onClick={() => {
                              setInspectedPath(citePath);
                              setInspectorTab('evidence');
                            }}
                            className={`w-full flex items-center justify-between gap-3 px-3.5 py-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-blue-600 ${
                              isSelected ? 'bg-blue-50/70' : 'hover:bg-slate-50'
                            }`}
                          >
                            <span className="font-mono text-xs font-medium text-slate-900 truncate">
                              {citePath}
                            </span>
                            <span className="text-xs text-slate-500 whitespace-nowrap shrink-0">
                              {doc?.modality ?? 'source'} · Inspect
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          )}
        </section>

        {/* Right: Source Evidence, Retrieval Trace & Query History */}
        <section
          aria-label="Evidence and retrieval inspector"
          className="lg:col-span-5 bg-white border border-slate-200 rounded-lg p-5 flex flex-col space-y-4"
        >
          <div
            role="tablist"
            aria-label="Inspector views"
            className="flex items-center gap-1 p-1 bg-slate-100 rounded-md self-start"
          >
            {(
              [
                { id: 'evidence', label: 'Source Evidence' },
                { id: 'retrieval', label: 'Retrieval Trace' },
                { id: 'history', label: `History (${history.length})` },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={inspectorTab === tab.id}
                onClick={() => setInspectorTab(tab.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-blue-600 ${
                  inspectorTab === tab.id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex-1 min-h-0">
            {inspectorTab === 'evidence' && (
              <DocumentPreviewPane
                document={inspectedDoc}
                emptyMessage="Run a query or select a cited path to verify its underlying source content."
              />
            )}

            {inspectorTab === 'retrieval' && (
              <div className="space-y-3">
                {!activeResult ? (
                  <p className="text-xs text-slate-500 py-8 text-center">
                    Execute a query to inspect 1st-hop and 2nd-hop retrieval candidates.
                  </p>
                ) : (
                  <>
                    <p className="text-xs text-slate-600">
                      Ranked corpus candidates passed into the necessity-principle extractor
                      {activeResult.multiHopTriggered
                        ? ' (2-hop cross-reference expansion active).'
                        : '.'}
                    </p>
                    <ul className="divide-y divide-slate-200 border border-slate-200 rounded-md">
                      {activeResult.retrievedCandidates.map((cand) => {
                        const isCited = activeResult.output.citations.includes(cand.path);
                        return (
                          <li key={cand.path}>
                            <button
                              type="button"
                              onClick={() => {
                                setInspectedPath(cand.path);
                                setInspectorTab('evidence');
                              }}
                              className="w-full px-3 py-2.5 text-left hover:bg-slate-50 transition-colors space-y-1"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-mono text-xs font-medium text-slate-900 truncate">
                                  {cand.path}
                                </span>
                                <span className="font-mono text-xs tabular-nums text-slate-600 shrink-0">
                                  {cand.score.toFixed(1)}
                                </span>
                              </div>
                              <div className="flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
                                <span>Hop {cand.hop}</span>
                                <span aria-hidden="true">·</span>
                                <span className={isCited ? 'text-emerald-700 font-medium' : ''}>
                                  {isCited ? 'Cited (Necessary)' : 'Retrieved only'}
                                </span>
                                {cand.isSuperseded && (
                                  <>
                                    <span aria-hidden="true">·</span>
                                    <span className="text-amber-700">Superseded</span>
                                  </>
                                )}
                              </div>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </>
                )}
              </div>
            )}

            {inspectorTab === 'history' && (
              <div className="space-y-2">
                {history.length === 0 ? (
                  <p className="text-xs text-slate-500 py-8 text-center">
                    Executed queries in this session will appear here.
                  </p>
                ) : (
                  <ul className="divide-y divide-slate-200 border border-slate-200 rounded-md">
                    {history.map((item, idx) => (
                      <li key={`${item.queryId}-${item.timestamp}-${idx}`}>
                        <button
                          type="button"
                          onClick={() => {
                            onSelectHistory(item);
                            setQueryText(item.query);
                            setQueryId(item.queryId);
                            setInspectedPath(item.output.citations[0] ?? null);
                          }}
                          className="w-full px-3.5 py-2.5 text-left hover:bg-slate-50 transition-colors space-y-1"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-xs font-semibold text-slate-900">
                              {item.output.answer || '"" (Refusal)'}
                            </span>
                            <span className="font-mono text-xs tabular-nums text-slate-500">
                              {item.queryId} · {item.latencyMs} ms
                            </span>
                          </div>
                          <p className="text-xs text-slate-600 line-clamp-1">{item.query}</p>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
