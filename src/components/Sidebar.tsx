import {
  BookOpen,
  CheckSquare,
  Database,
  Search,
  X,
} from 'lucide-react';
import type { CorpusIndexSummary } from '../types/rag';

export type WorkspaceView = 'workbench' | 'corpus' | 'benchmark' | 'contract';

interface SidebarProps {
  activeView: WorkspaceView;
  onSelectView: (view: WorkspaceView) => void;
  corpus: CorpusIndexSummary | null;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

const NAV_ITEMS: Array<{
  id: WorkspaceView;
  label: string;
  icon: typeof Search;
}> = [
  { id: 'workbench', label: 'Query Workbench', icon: Search },
  { id: 'corpus', label: 'Corpus Index', icon: Database },
  { id: 'benchmark', label: 'Evaluation Suite', icon: CheckSquare },
  { id: 'contract', label: 'Contract & Schema', icon: BookOpen },
];

export function Sidebar({
  activeView,
  onSelectView,
  corpus,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
  const content = (
    <div className="flex h-full flex-col bg-white border-r border-slate-200">
      <div className="flex items-center justify-between h-14 px-5 border-b border-slate-200">
        <a
          href="#workbench"
          onClick={(e) => {
            e.preventDefault();
            onSelectView('workbench');
            onCloseMobile();
          }}
          className="font-display text-base font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
        >
          Orrery RAG
        </a>
        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Close navigation menu"
          className="lg:hidden p-2 text-slate-500 hover:text-slate-900 rounded-md focus-visible:outline-2 focus-visible:outline-blue-600"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      <nav aria-label="Primary workspace navigation" className="flex-1 px-3 py-4 space-y-1">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onSelectView(item.id);
                onCloseMobile();
              }}
              aria-current={isActive ? 'page' : undefined}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-blue-600 ${
                isActive
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="px-5 py-4 border-t border-slate-200 space-y-2.5">
        <p className="text-xs font-semibold text-slate-900">Active Corpus</p>
        <p className="text-xs text-slate-500 truncate" title={corpus?.corpusName ?? 'Loading...'}>
          {corpus?.corpusName ?? 'Loading index...'}
        </p>
        {corpus && (
          <dl className="grid grid-cols-2 gap-y-2 gap-x-3 pt-1 text-xs">
            <div>
              <dt className="text-slate-500">Indexed</dt>
              <dd className="font-mono tabular-nums font-semibold text-slate-900">
                {corpus.indexedCount}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Multimodal</dt>
              <dd className="font-mono tabular-nums font-semibold text-slate-900">
                {corpus.multimodalCount}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Superseded</dt>
              <dd className="font-mono tabular-nums font-semibold text-amber-700">
                {corpus.supersededCount}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Skipped</dt>
              <dd className="font-mono tabular-nums font-semibold text-red-700">
                {corpus.skippedCount}
              </dd>
            </div>
          </dl>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop fixed sidebar */}
      <aside className="hidden lg:block lg:w-64 lg:shrink-0 lg:fixed lg:inset-y-0 lg:left-0 z-20">
        {content}
      </aside>

      {/* Mobile slide-over drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/40"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <aside className="relative w-64 max-w-[82vw] h-full z-50">{content}</aside>
        </div>
      )}
    </>
  );
}
