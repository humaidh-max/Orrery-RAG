import { useState, type ChangeEvent, type FormEvent } from 'react';
import {
  Loader2,
  Search,
  Trash2,
  Upload,
  RotateCcw,
  AlertCircle,
} from 'lucide-react';
import type { CorpusIndexSummary, IndexedDocument } from '../types/rag';
import {
  DocumentPreviewPane,
  formatBytes,
  getStatusDisplay,
} from './DocumentPreviewPane';

interface CorpusIndexViewProps {
  corpus: CorpusIndexSummary | null;
  onCorpusUpdated: (updated: CorpusIndexSummary) => void;
  onResetCorpus: () => Promise<void>;
  isReindexing: boolean;
}

type FilterMode = 'all' | 'indexed' | 'multimodal' | 'protected';

const UPLOAD_DIRECTORIES = [
  'specs',
  'support',
  'logs',
  'engineering',
  'planning',
  'vendor',
  'uploads',
];

export function CorpusIndexView({
  corpus,
  onCorpusUpdated,
  onResetCorpus,
  isReindexing,
}: CorpusIndexViewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [selectedPath, setSelectedPath] = useState<string | null>(
    'specs/tq40_datasheet_r2.pdf'
  );
  const [showUploadPanel, setShowUploadPanel] = useState(false);
  const [uploadDir, setUploadDir] = useState('uploads');
  const [selectedFiles, setSelectedFiles] = useState<FileList | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [deletingPath, setDeletingPath] = useState<string | null>(null);

  const docs = corpus?.documents ?? [];

  const filteredDocs = docs.filter((doc) => {
    const matchesSearch =
      !searchTerm.trim() ||
      doc.path.toLowerCase().includes(searchTerm.toLowerCase()) ||
      doc.excerpt.toLowerCase().includes(searchTerm.toLowerCase());

    if (!matchesSearch) return false;

    if (filterMode === 'indexed') return doc.status === 'indexed';
    if (filterMode === 'multimodal') return doc.modality === 'image';
    if (filterMode === 'protected') {
      return (
        doc.status === 'superseded' ||
        doc.status === 'encrypted' ||
        doc.status === 'unreadable' ||
        doc.status === 'unsupported' ||
        doc.status === 'empty_dir'
      );
    }
    return true;
  });

  const selectedDoc: IndexedDocument | null =
    docs.find((d) => d.path === selectedPath) ?? filteredDocs[0] ?? null;

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    setSelectedFiles(e.target.files);
    setUploadError(null);
    setUploadSuccess(null);
  };

  const handleUploadSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedFiles || selectedFiles.length === 0) {
      setUploadError('Choose at least one document to ingest.');
      return;
    }

    setIsUploading(true);
    setUploadError(null);
    setUploadSuccess(null);

    try {
      const formData = new FormData();
      formData.append('directory', uploadDir);
      Array.from(selectedFiles).forEach((file) => {
        formData.append('files', file);
      });

      const res = await fetch('/api/corpus/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to upload documents');
      }

      onCorpusUpdated(data.index);
      const firstAdded = data.savedPaths?.[0];
      if (firstAdded) {
        setSelectedPath(firstAdded);
      }
      setUploadSuccess(
        `Ingested ${data.savedPaths.length} file(s) into ${uploadDir}/ and rebuilt index.`
      );
      setSelectedFiles(null);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async (relPath: string) => {
    setDeletingPath(relPath);
    try {
      const res = await fetch(`/api/corpus/file?path=${encodeURIComponent(relPath)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Delete failed');
      }
      onCorpusUpdated(data);
      if (selectedPath === relPath) {
        setSelectedPath(null);
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeletingPath(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Corpus Summary Strip */}
      <div className="bg-white border border-slate-200 rounded-lg px-5 py-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
          <div>
            <span className="text-slate-500 block">Total Entries</span>
            <span className="font-mono tabular-nums text-base font-semibold text-slate-900">
              {corpus?.totalEntries ?? 0}
            </span>
          </div>
          <div className="h-8 w-px bg-slate-200 hidden sm:block" aria-hidden="true" />
          <div>
            <span className="text-slate-500 block">Indexed Readable</span>
            <span className="font-mono tabular-nums text-base font-semibold text-emerald-700">
              {corpus?.indexedCount ?? 0}
            </span>
          </div>
          <div className="h-8 w-px bg-slate-200 hidden sm:block" aria-hidden="true" />
          <div>
            <span className="text-slate-500 block">Superseded</span>
            <span className="font-mono tabular-nums text-base font-semibold text-amber-700">
              {corpus?.supersededCount ?? 0}
            </span>
          </div>
          <div className="h-8 w-px bg-slate-200 hidden sm:block" aria-hidden="true" />
          <div>
            <span className="text-slate-500 block">Protected / Skipped</span>
            <span className="font-mono tabular-nums text-base font-semibold text-red-700">
              {corpus?.skippedCount ?? 0}
            </span>
          </div>
          <div className="h-8 w-px bg-slate-200 hidden sm:block" aria-hidden="true" />
          <div>
            <span className="text-slate-500 block">Index Pass Time</span>
            <span className="font-mono tabular-nums text-base font-semibold text-slate-900">
              {corpus ? `${corpus.durationMs} ms` : '—'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowUploadPanel((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-blue-600"
          >
            <Upload className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{showUploadPanel ? 'Hide Uploader' : 'Upload Documents'}</span>
          </button>
          <button
            type="button"
            disabled={isReindexing}
            onClick={onResetCorpus}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-blue-600"
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Reset Corpus</span>
          </button>
        </div>
      </div>

      {/* Collapsible Upload Panel */}
      {showUploadPanel && (
        <section
          aria-label="Upload corpus documents"
          className="bg-white border border-slate-200 rounded-lg p-5 space-y-4"
        >
          <div className="space-y-1">
            <h2 className="font-display text-sm font-semibold text-slate-900">
              Ingest Heterogeneous Files into Live Corpus
            </h2>
            <p className="text-xs text-slate-500">
              Supports PDF, DOCX, XLSX, CSV, TXT, LOG, PY, PNG, and JPG. Encrypted PDFs and
              unsupported binaries are detected and skipped defensively without halting the index.
            </p>
          </div>

          <form onSubmit={handleUploadSubmit} className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
            <div className="md:col-span-3 space-y-1.5">
              <label
                htmlFor="upload-subdir"
                className="block text-xs font-semibold text-slate-900"
              >
                Target Folder
              </label>
              <select
                id="upload-subdir"
                value={uploadDir}
                onChange={(e) => setUploadDir(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-mono text-slate-900 focus:border-blue-600 focus:outline-none"
              >
                {UPLOAD_DIRECTORIES.map((dir) => (
                  <option key={dir} value={dir}>
                    {dir}/
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-6 space-y-1.5">
              <label
                htmlFor="corpus-file-input"
                className="block text-xs font-semibold text-slate-900"
              >
                Select File(s)
              </label>
              <input
                id="corpus-file-input"
                type="file"
                multiple
                onChange={handleFileChange}
                className="block w-full text-xs text-slate-700 file:mr-3 file:py-2 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-medium file:bg-slate-100 file:text-slate-900 hover:file:bg-slate-200"
              />
            </div>

            <div className="md:col-span-3">
              <button
                type="submit"
                disabled={isUploading}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-60 rounded-md transition-colors whitespace-nowrap shrink-0"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                    <span>Indexing...</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Ingest & Index</span>
                  </>
                )}
              </button>
            </div>
          </form>

          {uploadError && (
            <div role="alert" className="flex items-center gap-2 text-xs text-red-700">
              <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{uploadError}</span>
            </div>
          )}
          {uploadSuccess && (
            <p className="text-xs font-medium text-emerald-700">{uploadSuccess}</p>
          )}
        </section>
      )}

      {/* Table + Preview Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <section
          aria-label="Corpus file inventory"
          className="lg:col-span-7 bg-white border border-slate-200 rounded-lg overflow-hidden flex flex-col"
        >
          {/* Filter Toolbar */}
          <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-xs">
              <Search
                className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                aria-hidden="true"
              />
              <input
                type="search"
                aria-label="Filter corpus files"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search paths or content..."
                className="w-full pl-9 pr-3 py-1.5 text-xs rounded-md border border-slate-300 text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-md self-start sm:self-auto">
              {(
                [
                  { id: 'all', label: 'All' },
                  { id: 'indexed', label: 'Indexed' },
                  { id: 'multimodal', label: 'Multimodal' },
                  { id: 'protected', label: 'Protected' },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilterMode(f.id)}
                  className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                    filterMode === f.id
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* High-Density Data Table */}
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="py-2.5 px-4">Corpus-Relative Path</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right">Size</th>
                  <th className="py-2.5 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredDocs.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-10 px-4 text-center text-slate-500">
                      No corpus files match the current filter.
                    </td>
                  </tr>
                ) : (
                  filteredDocs.map((doc) => {
                    const statusInfo = getStatusDisplay(doc.status);
                    const isSelected = selectedDoc?.path === doc.path;
                    return (
                      <tr
                        key={doc.path}
                        className={`transition-colors ${
                          isSelected ? 'bg-blue-50/60' : 'hover:bg-slate-50'
                        }`}
                      >
                        <td className="py-2.5 px-4">
                          <button
                            type="button"
                            onClick={() => setSelectedPath(doc.path)}
                            className="font-mono text-xs font-medium text-slate-900 hover:text-blue-700 text-left break-all"
                          >
                            {doc.path}
                          </button>
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span className={`font-medium ${statusInfo.colorClass}`}>
                            {statusInfo.label}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-600 whitespace-nowrap">
                          {formatBytes(doc.sizeBytes)}
                        </td>
                        <td className="py-2.5 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setSelectedPath(doc.path)}
                              aria-label={`Inspect ${doc.path}`}
                              className="text-xs font-medium text-blue-700 hover:text-blue-900"
                            >
                              Inspect
                            </button>
                            {!doc.isBundled && (
                              <button
                                type="button"
                                disabled={deletingPath === doc.path}
                                onClick={() => handleDelete(doc.path)}
                                aria-label={`Delete ${doc.path}`}
                                className="text-slate-400 hover:text-red-700 p-1"
                              >
                                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Document Preview Panel */}
        <section
          aria-label="Selected document preview"
          className="lg:col-span-5 bg-white border border-slate-200 rounded-lg p-5"
        >
          <DocumentPreviewPane document={selectedDoc} />
        </section>
      </div>
    </div>
  );
}
