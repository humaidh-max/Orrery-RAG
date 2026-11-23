import { useState } from 'react';
import { AlertTriangle, FileText, Image as ImageIcon, Lock, FolderOpen } from 'lucide-react';
import type { IndexedDocument } from '../types/rag';

interface DocumentPreviewPaneProps {
  document: IndexedDocument | null;
  emptyMessage?: string;
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function getStatusDisplay(status: IndexedDocument['status']): {
  label: string;
  colorClass: string;
} {
  switch (status) {
    case 'indexed':
      return { label: 'Indexed', colorClass: 'text-emerald-700' };
    case 'superseded':
      return { label: 'Superseded (Withdrawn)', colorClass: 'text-amber-700' };
    case 'encrypted':
      return { label: 'Encrypted (Locked)', colorClass: 'text-red-700' };
    case 'unreadable':
      return { label: 'Unreadable (EACCES)', colorClass: 'text-red-700' };
    case 'unsupported':
      return { label: 'Unsupported Binary', colorClass: 'text-slate-600' };
    case 'empty_dir':
      return { label: 'Empty Directory', colorClass: 'text-slate-500' };
  }
}

export function DocumentPreviewPane({
  document,
  emptyMessage = 'Select a document or citation to inspect its parsed content.',
}: DocumentPreviewPaneProps) {
  const [imageFailed, setImageFailed] = useState(false);

  if (!document) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-6 text-center text-slate-500">
        <FileText className="w-6 h-6 text-slate-400 mb-2" aria-hidden="true" />
        <p className="text-sm">{emptyMessage}</p>
      </div>
    );
  }

  const statusInfo = getStatusDisplay(document.status);
  const rawImageUrl = `/api/corpus/raw?path=${encodeURIComponent(document.path)}`;

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h3 className="font-mono text-sm font-semibold text-slate-900 break-all">
          {document.path}
        </h3>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
          <span className={`font-medium ${statusInfo.colorClass}`}>{statusInfo.label}</span>
          <span aria-hidden="true">·</span>
          <span>{document.modality}</span>
          <span aria-hidden="true">·</span>
          <span className="font-mono tabular-nums">{formatBytes(document.sizeBytes)}</span>
          {document.chunkCount > 0 && (
            <>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">{document.chunkCount} chunks</span>
            </>
          )}
        </div>
      </div>

      {document.statusReason && (
        <p className="text-xs text-slate-600 leading-relaxed border-t border-slate-100 pt-3">
          {document.statusReason}
        </p>
      )}

      {document.status === 'encrypted' || document.status === 'unreadable' ? (
        <div className="p-4 bg-red-50/60 border border-red-200 rounded-md space-y-1.5">
          <div className="flex items-center gap-2 text-xs font-semibold text-red-800">
            <Lock className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>
              {document.status === 'encrypted'
                ? 'Encrypted Payload Excluded'
                : 'Permission Denied — Skipped Defensively'}
            </span>
          </div>
          <p className="text-xs text-red-700 leading-relaxed">
            This entry is intentionally excluded from retrieval context so the engine never
            hallucinates or crashes during recursive corpus traversal.
          </p>
        </div>
      ) : document.status === 'empty_dir' ? (
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-md flex items-center gap-2.5 text-xs text-slate-600">
          <FolderOpen className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
          <span>Empty directory verified and logged safely without raising traversal errors.</span>
        </div>
      ) : document.modality === 'image' ? (
        <div className="space-y-2.5">
          <div className="border border-slate-200 rounded-md bg-slate-50 overflow-hidden">
            {!imageFailed ? (
              <img
                key={document.path}
                src={rawImageUrl}
                alt={`Technical visual asset ${document.path}`}
                referrerPolicy="no-referrer"
                onError={() => setImageFailed(true)}
                className="w-full max-h-72 object-contain bg-white p-2"
              />
            ) : (
              <div className="flex flex-col items-center justify-center py-10 px-4 text-slate-500">
                <ImageIcon className="w-6 h-6 mb-2 text-slate-400" aria-hidden="true" />
                <span className="text-xs font-mono">{document.name}</span>
              </div>
            )}
          </div>
          <p className="text-xs text-slate-500">
            Visual asset attached natively as multimodal inlineData during RAG inference.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {document.isSuperseded && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-md flex items-start gap-2 text-xs text-amber-800">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
              <span>
                Superseded document. Retained in index for auditability but flagged as withdrawn so
                canonical revisions take precedence.
              </span>
            </div>
          )}
          <pre className="p-3.5 bg-slate-50 border border-slate-200 rounded-md text-xs font-mono text-slate-800 overflow-x-auto max-h-80 overflow-y-auto whitespace-pre-wrap leading-relaxed">
            {document.textContent || '(No extractable text content)'}
          </pre>
        </div>
      )}
    </div>
  );
}
