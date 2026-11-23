import { Fragment, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  Play,
  AlertCircle,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import type { BenchmarkGradeResult, BenchmarkQuery } from '../types/rag';

interface EvaluationSuiteViewProps {
  questions: BenchmarkQuery[];
  grades: Record<string, BenchmarkGradeResult>;
  runningQueryId: string | null;
  isRunningAll: boolean;
  errorMessage: string | null;
  onRunSingle: (queryId: string) => Promise<void>;
  onRunAll: () => Promise<void>;
}

export function EvaluationSuiteView({
  questions,
  grades,
  runningQueryId,
  isRunningAll,
  errorMessage,
  onRunSingle,
  onRunAll,
}: EvaluationSuiteViewProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const completedGrades = questions
    .map((q) => grades[q.queryId])
    .filter((g): g is BenchmarkGradeResult => Boolean(g));

  const totalScore = completedGrades.reduce((sum, g) => sum + g.points, 0);
  const maxPossible = questions.length * 20;
  const passedCount = completedGrades.filter((g) => g.passed).length;
  const exactCiteCount = completedGrades.filter((g) => g.citationDiff.exact).length;
  const avgLatency =
    completedGrades.length > 0
      ? Math.round(
          completedGrades.reduce((sum, g) => sum + g.latencyMs, 0) / completedGrades.length
        )
      : null;

  return (
    <div className="space-y-6">
      {/* Evaluation Scoreboard Strip */}
      <div className="bg-white border border-slate-200 rounded-lg px-5 py-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
          <div>
            <span className="text-slate-500 block">Graded Score</span>
            <span
              data-testid="benchmark-score"
              className="font-mono tabular-nums text-base font-semibold text-slate-900"
            >
              {totalScore} / {maxPossible}
            </span>
          </div>
          <div className="h-8 w-px bg-slate-200 hidden sm:block" aria-hidden="true" />
          <div>
            <span className="text-slate-500 block">Queries Passed</span>
            <span className="font-mono tabular-nums text-base font-semibold text-emerald-700">
              {passedCount} / {completedGrades.length || questions.length}
            </span>
          </div>
          <div className="h-8 w-px bg-slate-200 hidden sm:block" aria-hidden="true" />
          <div>
            <span className="text-slate-500 block">Exact Citation Sets</span>
            <span className="font-mono tabular-nums text-base font-semibold text-slate-900">
              {exactCiteCount} / {completedGrades.length || questions.length}
            </span>
          </div>
          <div className="h-8 w-px bg-slate-200 hidden sm:block" aria-hidden="true" />
          <div>
            <span className="text-slate-500 block">Mean Latency</span>
            <span className="font-mono tabular-nums text-base font-semibold text-slate-900">
              {avgLatency !== null ? `${avgLatency} ms` : '—'}
            </span>
          </div>
        </div>

        <button
          type="button"
          disabled={isRunningAll || runningQueryId !== null || questions.length === 0}
          onClick={onRunAll}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-60 rounded-md transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-blue-600"
        >
          {isRunningAll ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
              <span>Running Suite...</span>
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Run All 10 Queries</span>
            </>
          )}
        </button>
      </div>

      {errorMessage && (
        <div
          role="alert"
          className="p-3.5 rounded-md bg-red-50 border border-red-200 flex items-start gap-2.5 text-xs text-red-800"
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Benchmark Table */}
      <section
        aria-label="MC-3 sample benchmark queries"
        className="bg-white border border-slate-200 rounded-lg overflow-hidden"
      >
        <div className="px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-sm font-semibold text-slate-900">
              Sample Verification Harness
            </h2>
            <p className="text-xs text-slate-500">
              20 points per query — requires both normalized value match and exact citation set
              equality. Zero partial credit.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <th className="py-2.5 pl-4 pr-2 w-10">
                  <span className="sr-only">Expand</span>
                </th>
                <th className="py-2.5 px-3">ID</th>
                <th className="py-2.5 px-3">Query & Modality</th>
                <th className="py-2.5 px-3">Expected</th>
                <th className="py-2.5 px-3">Actual</th>
                <th className="py-2.5 px-3">Result</th>
                <th className="py-2.5 px-3 text-right">Pts</th>
                <th className="py-2.5 px-4 text-right">Run</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {questions.map((q) => {
                const grade = grades[q.queryId];
                const isRunning = runningQueryId === q.queryId;
                const isExpanded = expandedId === q.queryId;

                return (
                  <Fragment key={q.queryId}>
                    <tr className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 pl-4 pr-2">
                        <button
                          type="button"
                          onClick={() => setExpandedId(isExpanded ? null : q.queryId)}
                          aria-expanded={isExpanded}
                          aria-label={`Toggle details for ${q.queryId}`}
                          className="p-1 text-slate-400 hover:text-slate-800 rounded focus-visible:outline-2 focus-visible:outline-blue-600"
                        >
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4" aria-hidden="true" />
                          ) : (
                            <ChevronRight className="w-4 h-4" aria-hidden="true" />
                          )}
                        </button>
                      </td>
                      <td className="py-3 px-3 font-mono font-medium text-slate-700 whitespace-nowrap">
                        {q.queryId}
                      </td>
                      <td className="py-3 px-3 max-w-md">
                        <p className="text-slate-900 font-medium leading-snug">{q.query}</p>
                        <p className="text-slate-500 mt-0.5">{q.category}</p>
                      </td>
                      <td className="py-3 px-3 font-mono text-slate-700 whitespace-nowrap">
                        {q.expected_answer === '' ? '"" (refusal)' : q.expected_answer}
                      </td>
                      <td className="py-3 px-3 font-mono text-slate-900 whitespace-nowrap">
                        {isRunning ? (
                          <span className="text-slate-400">Running...</span>
                        ) : grade ? (
                          grade.actual.answer === '' ? '"" (refusal)' : grade.actual.answer
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        {isRunning ? (
                          <span className="inline-flex items-center gap-1.5 text-blue-700 font-medium">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                            <span>Evaluating</span>
                          </span>
                        ) : grade ? (
                          grade.passed ? (
                            <span className="inline-flex items-center gap-1.5 text-emerald-700 font-medium">
                              <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>Pass</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-red-700 font-medium">
                              <XCircle className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>Fail</span>
                            </span>
                          )
                        ) : (
                          <span className="text-slate-400">Not run</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                        {grade ? `${grade.points} / 20` : '—'}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <button
                          type="button"
                          disabled={isRunning || isRunningAll}
                          onClick={() => onRunSingle(q.queryId)}
                          aria-label={`Run ${q.queryId}`}
                          className="px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 rounded transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-blue-600"
                        >
                          Run
                        </button>
                      </td>
                    </tr>

                    {isExpanded && (
                      <tr className="bg-slate-50/70">
                        <td colSpan={8} className="px-6 py-4">
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 text-xs">
                            <div className="space-y-2.5">
                              <div>
                                <p className="font-semibold text-slate-900">
                                  Expected Citations (Exact Set)
                                </p>
                                <p className="font-mono text-slate-700 mt-0.5">
                                  {q.expected_citations.length > 0
                                    ? q.expected_citations.join(', ')
                                    : '[] (empty set)'}
                                </p>
                              </div>
                              {q.note && (
                                <div>
                                  <p className="font-semibold text-slate-900">Benchmark Note</p>
                                  <p className="text-slate-600 leading-relaxed mt-0.5">{q.note}</p>
                                </div>
                              )}
                              {grade?.failureReason && (
                                <div>
                                  <p className="font-semibold text-red-800">Grading Diagnostic</p>
                                  <p className="text-red-700 mt-0.5">{grade.failureReason}</p>
                                </div>
                              )}
                            </div>

                            <div className="space-y-1.5">
                              <p className="font-semibold text-slate-900">
                                Actual JSON Output ({q.queryId}_output.json)
                              </p>
                              {grade ? (
                                <pre className="p-3 rounded-md bg-slate-900 text-slate-100 font-mono text-xs overflow-x-auto">
                                  {JSON.stringify(grade.actual, null, 2)}
                                </pre>
                              ) : (
                                <p className="text-slate-500">
                                  Run this query to inspect the generated JSON payload.
                                </p>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
