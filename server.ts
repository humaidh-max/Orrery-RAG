import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { createServer as createViteServer } from 'vite';
import type { BenchmarkQuery, CorpusIndexSummary } from './src/types/rag.ts';
import { gradeRagResponse } from './src/lib/rag-scoring.ts';
import {
  BUNDLED_CORPUS_PATHS,
  CORPUS_ROOT,
  UPLOADED_ASSETS_DIR,
  ensureBundledCorpus,
} from './server/corpus-bootstrap.ts';
import { buildCorpusIndex, loadOrBuildCorpusIndex } from './server/indexer.ts';
import { executeRagQuery } from './server/rag-engine.ts';

const PORT = Number(process.env.PORT) || 3000;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 10 },
});

let cachedIndex: CorpusIndexSummary | null = null;

async function getIndex(): Promise<CorpusIndexSummary> {
  if (!cachedIndex) {
    cachedIndex = await loadOrBuildCorpusIndex();
  }
  return cachedIndex;
}

function loadBenchmarkQuestions(): BenchmarkQuery[] {
  const samplePath = path.join(UPLOADED_ASSETS_DIR, 'sample-questions_1c01d483.json');
  const raw = JSON.parse(fs.readFileSync(samplePath, 'utf8')) as {
    queries: Array<Omit<BenchmarkQuery, 'queryId'>>;
  };
  return raw.queries.map((q) => ({
    ...q,
    queryId: `query_${String(q.n).padStart(2, '0')}`,
  }));
}

function sanitizeSubdir(raw: string): string {
  const cleaned = raw
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '')
    .replace(/\.\./g, '')
    .replace(/[^a-zA-Z0-9/_-]/g, '');
  return cleaned || 'uploads';
}

function sanitizeFilename(raw: string): string {
  const base = path.basename(raw).replace(/[^a-zA-Z0-9._-]/g, '_');
  return base || `document_${Date.now()}.txt`;
}

async function startServer(): Promise<void> {
  ensureBundledCorpus(false);
  cachedIndex = await buildCorpusIndex(CORPUS_ROOT);

  const app = express();
  app.use(express.json({ limit: '4mb' }));

  // 1. Get current corpus index summary & document inventory
  app.get('/api/corpus', async (_req, res) => {
    try {
      const idx = await getIndex();
      res.json(idx);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load corpus index';
      res.status(500).json({ error: message });
    }
  });

  // 2. Run Phase-1 defensive corpus re-index
  app.post('/api/corpus/reindex', async (req, res) => {
    try {
      const reset = req.body?.reset === true;
      if (reset) {
        ensureBundledCorpus(true);
      }
      cachedIndex = await buildCorpusIndex(CORPUS_ROOT);
      res.json(cachedIndex);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to re-index corpus';
      res.status(500).json({ error: message });
    }
  });

  // 3. Upload heterogeneous files into a corpus subdirectory & re-index defensively
  app.post('/api/corpus/upload', upload.array('files', 10), async (req, res) => {
    try {
      const files = (req.files as Express.Multer.File[]) ?? [];
      if (files.length === 0) {
        res.status(400).json({ error: 'No files provided for upload.' });
        return;
      }

      const subdir = sanitizeSubdir(typeof req.body?.directory === 'string' ? req.body.directory : 'uploads');
      const savedPaths: string[] = [];

      for (const file of files) {
        const safeName = sanitizeFilename(file.originalname);
        const relPath = `${subdir}/${safeName}`;
        const destPath = path.resolve(CORPUS_ROOT, relPath);
        if (!destPath.startsWith(CORPUS_ROOT)) {
          continue;
        }
        fs.mkdirSync(path.dirname(destPath), { recursive: true });
        fs.writeFileSync(destPath, file.buffer);
        savedPaths.push(relPath);
      }

      cachedIndex = await buildCorpusIndex(CORPUS_ROOT);
      res.json({ savedPaths, index: cachedIndex });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      res.status(500).json({ error: message });
    }
  });

  // 4. Delete a user-uploaded corpus file & re-index
  app.delete('/api/corpus/file', async (req, res) => {
    try {
      const relPath = typeof req.query.path === 'string' ? req.query.path.trim() : '';
      if (!relPath || relPath.includes('..') || relPath.startsWith('/')) {
        res.status(400).json({ error: 'Invalid corpus-relative path.' });
        return;
      }
      if (BUNDLED_CORPUS_PATHS.has(relPath)) {
        res.status(400).json({ error: 'Bundled MC-3 reference corpus files cannot be deleted.' });
        return;
      }
      const target = path.resolve(CORPUS_ROOT, relPath);
      if (!target.startsWith(CORPUS_ROOT) || !fs.existsSync(target)) {
        res.status(404).json({ error: 'File not found in corpus.' });
        return;
      }
      fs.unlinkSync(target);
      cachedIndex = await buildCorpusIndex(CORPUS_ROOT);
      res.json(cachedIndex);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Delete failed';
      res.status(500).json({ error: message });
    }
  });

  // 5. Serve raw image asset preview for corpus document inspector
  app.get('/api/corpus/raw', (req, res) => {
    const relPath = typeof req.query.path === 'string' ? req.query.path.trim() : '';
    if (!relPath || relPath.includes('..') || relPath.startsWith('/')) {
      res.status(400).json({ error: 'Invalid path' });
      return;
    }
    const target = path.resolve(CORPUS_ROOT, relPath);
    if (!target.startsWith(CORPUS_ROOT) || !fs.existsSync(target)) {
      res.status(404).json({ error: 'File not found' });
      return;
    }
    const ext = path.extname(target).toLowerCase();
    if (!['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
      res.status(403).json({ error: 'Raw preview is restricted to visual image assets.' });
      return;
    }
    res.sendFile(target);
  });

  // 6. Execute a strict RAG technical query
  app.post('/api/query', async (req, res) => {
    try {
      const query = typeof req.body?.query === 'string' ? req.body.query.trim() : '';
      const queryId =
        typeof req.body?.queryId === 'string' && req.body.queryId.trim()
          ? req.body.queryId.trim().replace(/[^a-zA-Z0-9_-]/g, '_')
          : 'query_01';

      if (!query) {
        res.status(400).json({ error: 'Please enter a technical query to execute.' });
        return;
      }

      const idx = await getIndex();
      const result = await executeRagQuery(query, queryId, idx);
      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'RAG query execution failed';
      res.status(500).json({ error: message });
    }
  });

  // 7. Return official MC-3 sample benchmark questions
  app.get('/api/benchmark/questions', (_req, res) => {
    try {
      const questions = loadBenchmarkQuestions();
      res.json({ questions });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load sample questions';
      res.status(500).json({ error: message });
    }
  });

  // 8. Run a single benchmark question by queryId and grade strictly against MC-3 rules
  app.post('/api/benchmark/run-one', async (req, res) => {
    try {
      const queryId = typeof req.body?.queryId === 'string' ? req.body.queryId.trim() : '';
      const questions = loadBenchmarkQuestions();
      const target = questions.find((q) => q.queryId === queryId);
      if (!target) {
        res.status(404).json({ error: `Benchmark query "${queryId}" not found.` });
        return;
      }

      const idx = await getIndex();
      const execResult = await executeRagQuery(target.query, target.queryId, idx);
      const grade = gradeRagResponse(execResult.output, target, execResult.latencyMs);

      res.json({ grade, execution: execResult });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Benchmark query execution failed';
      res.status(500).json({ error: message });
    }
  });

  // Mount Vite middleware in dev or static dist in production
  const isProd = process.env.NODE_ENV === 'production';
  if (isProd) {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Orrery RAG Workbench listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
