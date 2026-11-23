import { useCallback, useEffect, useState } from 'react';
import { Loader2, Menu, RefreshCw } from 'lucide-react';
import type {
  BenchmarkGradeResult,
  BenchmarkQuery,
  CorpusIndexSummary,
  QueryExecutionResult,
} from './types/rag';
import { Sidebar, type WorkspaceView } from './components/Sidebar';
import { QueryWorkbench } from './components/QueryWorkbench';
import { CorpusIndexView } from './components/CorpusIndexView';
import { EvaluationSuiteView } from './components/EvaluationSuiteView';
import { ContractSchemaView } from './components/ContractSchemaView';

const VIEW_LABELS: Record<WorkspaceView, string> = {
  workbench: 'Query Workbench',
  corpus: 'Corpus Index',
  benchmark: 'Evaluation Suite',
  contract: 'Contract & Schema',
};

export default function App() {
  const [activeView, setActiveView] = useState<WorkspaceView>('workbench');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const [corpus, setCorpus] = useState<CorpusIndexSummary | null>(null);
  const [isReindexing, setIsReindexing] = useState(false);

  const [history, setHistory] = useState<QueryExecutionResult[]>([]);
  const [activeResult, setActiveResult] = useState<QueryExecutionResult | null>(null);
  const [isQuerying, setIsQuerying] = useState(false);
  const [queryError, setQueryError] = useState<string | null>(null);

  const [benchmarkQuestions, setBenchmarkQuestions] = useState<BenchmarkQuery[]>([]);
  const [benchmarkGrades, setBenchmarkGrades] = useState<Record<string, BenchmarkGradeResult>>({});
  const [runningBenchmarkId, setRunningBenchmarkId] = useState<string | null>(null);
  const [isRunningAllBenchmarks, setIsRunningAllBenchmarks] = useState(false);
  const [benchmarkError, setBenchmarkError] = useState<string | null>(null);

  const loadInitialData = useCallback(async () => {
    try {
      const [corpusRes, benchRes] = await Promise.all([
        fetch('/api/corpus'),
        fetch('/api/benchmark/questions'),
      ]);
      if (corpusRes.ok) {
        const idx = (await corpusRes.json()) as CorpusIndexSummary;
        setCorpus(idx);
      }
      if (benchRes.ok) {
        const bData = (await benchRes.json()) as { questions: BenchmarkQuery[] };
        setBenchmarkQuestions(bData.questions);
      }
    } catch (err) {
      console.error('Failed to load initial workspace data:', err);
    }
  }, []);

  useEffect(() => {
    void loadInitialData();
  }, [loadInitialData]);

  const handleReindex = async (reset = false) => {
    setIsReindexing(true);
    try {
      const res = await fetch('/api/corpus/reindex', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reset }),
      });
      if (res.ok) {
        const updated = (await res.json()) as CorpusIndexSummary;
        setCorpus(updated);
      }
    } finally {
      setIsReindexing(false);
    }
  };

  const handleExecuteQuery = async (query: string, queryId: string) => {
    setIsQuerying(true);
    setQueryError(null);
    try {
      const res = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, queryId }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Query execution failed');
      }
      const result = data as QueryExecutionResult;
      setActiveResult(result);
      setHistory((prev) => [result, ...prev].slice(0, 20));
    } catch (err) {
      setQueryError(err instanceof Error ? err.message : 'Query execution failed');
    } finally {
      setIsQuerying(false);
    }
  };

  const runSingleBenchmark = async (queryId: string) => {
    setRunningBenchmarkId(queryId);
    setBenchmarkError(null);
    try {
      const res = await fetch('/api/benchmark/run-one', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queryId }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `Benchmark ${queryId} failed`);
      }
      const grade = data.grade as BenchmarkGradeResult;
      setBenchmarkGrades((prev) => ({ ...prev, [queryId]: grade }));
    } catch (err) {
      setBenchmarkError(err instanceof Error ? err.message : 'Benchmark failed');
    } finally {
      setRunningBenchmarkId(null);
    }
  };

  const runAllBenchmarks = async () => {
    setIsRunningAllBenchmarks(true);
    setBenchmarkError(null);
    try {
      for (const q of benchmarkQuestions) {
        setRunningBenchmarkId(q.queryId);
        const res = await fetch('/api/benchmark/run-one', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ queryId: q.queryId }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || `Benchmark ${q.queryId} failed`);
        }
        const grade = data.grade as BenchmarkGradeResult;
        setBenchmarkGrades((prev) => ({ ...prev, [q.queryId]: grade }));
      }
    } catch (err) {
      setBenchmarkError(err instanceof Error ? err.message : 'Benchmark run interrupted');
    } finally {
      setRunningBenchmarkId(null);
      setIsRunningAllBenchmarks(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex">
      <Sidebar
        activeView={activeView}
        onSelectView={setActiveView}
        corpus={corpus}
        mobileOpen={mobileNavOpen}
        onCloseMobile={() => setMobileNavOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0 lg:pl-64">
        {/* Top Header — SaaS Top Bar Contract */}
        <header className="sticky top-0 z-10 h-14 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden p-2 -ml-2 text-slate-600 hover:text-slate-900 rounded-md focus-visible:outline-2 focus-visible:outline-blue-600"
            >
              <Menu className="w-5 h-5" aria-hidden="true" />
            </button>
            <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm min-w-0">
              <span className="text-slate-500 hidden sm:inline whitespace-nowrap">
                Orrery Systems
              </span>
              <span className="text-slate-300 hidden sm:inline" aria-hidden="true">
                /
              </span>
              <h1 className="font-display font-semibold text-slate-900 truncate">
                {VIEW_LABELS[activeView]}
              </h1>
            </nav>
          </div>

          <button
            type="button"
            disabled={isReindexing}
            onClick={() => handleReindex(false)}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-900 bg-slate-100 hover:bg-slate-200 disabled:opacity-60 rounded-md transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-blue-600"
          >
            {isReindexing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
            )}
            <span>Re-Index Corpus</span>
          </button>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {activeView === 'workbench' && (
            <QueryWorkbench
              corpus={corpus}
              history={history}
              activeResult={activeResult}
              onExecuteQuery={handleExecuteQuery}
              onSelectHistory={setActiveResult}
              isQuerying={isQuerying}
              errorMessage={queryError}
            />
          )}

          {activeView === 'corpus' && (
            <CorpusIndexView
              corpus={corpus}
              onCorpusUpdated={setCorpus}
              onResetCorpus={() => handleReindex(true)}
              isReindexing={isReindexing}
            />
          )}

          {activeView === 'benchmark' && (
            <EvaluationSuiteView
              questions={benchmarkQuestions}
              grades={benchmarkGrades}
              runningQueryId={runningBenchmarkId}
              isRunningAll={isRunningAllBenchmarks}
              errorMessage={benchmarkError}
              onRunSingle={runSingleBenchmark}
              onRunAll={runAllBenchmarks}
            />
          )}

          {activeView === 'contract' && <ContractSchemaView />}
        </main>
      </div>
    </div>
  );
}
