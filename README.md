# Orrery RAG Workbench

An enterprise Retrieval-Augmented Generation (RAG) engine and verification workbench for strict technical question-answering over heterogeneous document corpora (PDF, DOCX, XLSX, CSV, TXT, LOG, Python source, and visual hardware diagrams/labels).

## Overview

Orrery RAG Workbench extracts concise, prose-free technical values and outputs a strict JSON payload adhering to the three-field contract:

```json
{
  "answer": "4.3.2",
  "citations": [
    "logs/prod_inference_2026-09-02.log",
    "support/bug_database.csv"
  ],
  "confidence": 0.95
}
```

When an answer is missing from the readable corpus or locked inside an encrypted/unreadable file, the engine enforces an honest refusal without guessing or outputting conversational prose:

```json
{
  "answer": "",
  "citations": [],
  "confidence": 0.0
}
```

## Key Features

- **Strict JSON Schema Extraction**: Outputs concise values only (preserving required qualifiers such as `Q3 FY27`, `REV-C2`, and `ORR-FAN-2214-B`) with one-click JSON copy and `<query-id>_output.json` export.
- **Necessity-Principle Citations & Multi-Hop Retrieval**: Performs 2-hop cross-reference entity expansion (e.g., bridging a production log incident to a ticket ID and its fix version in a CSV bug tracker) and cites only the exact set of corpus-relative paths strictly required to derive the answer—excluding withdrawn/superseded documents and near-miss decoys.
- **Multimodal Vision Analysis**: Natively inspects technical images (`.png`, `.jpg`, `.jpeg`, `.webp`) alongside text documents to answer queries unanswerable from text alone (such as backplane pinout diagrams and hardware asset labels).
- **Defensive Heterogeneous Corpus Indexer**: Recursively walks corpus trees per file without aborting on hostile edge cases—automatically detecting and isolating encrypted PDFs (`/Encrypt`), unreadable files (`chmod 000` / `EACCES`), withdrawn revisions, unsupported binaries, and empty directories.
- **Live Document Ingestion & Source Inspector**: Upload additional mixed-format files into any corpus directory, trigger on-demand re-indexing, and inspect parsed text or visual evidence side by side with extracted answers.
- **Evaluation Suite**: Built-in 10-query benchmark harness grading 20 points per query (200 max) on normalized answer match and exact citation set equality, with expandable citation diffs and latency metrics.

## Tech Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS v4, Lucide Icons, Vite
- **Backend**: Node.js 22+, Express, `@google/genai`, Multer
- **Document Parsers**: `unpdf` (PDF), `mammoth` (DOCX), `xlsx` (Excel), native UTF-8 text/CSV/log/Python readers, and native multimodal image handling

## Prerequisites

- **Node.js 22+** (`node -v`)
- **npm** (bundled with Node.js)
- A **Gemini API Key** from [Google AI Studio](https://aistudio.google.com/apikey)

## Getting Started (Localhost)

### 1. Clone the repository

```bash
git clone <your-github-repo-url>
cd <your-repo-folder>
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Edit `.env` and add your Gemini API key:

```env
GEMINI_API_KEY="your_actual_gemini_api_key"
APP_URL="http://localhost:3000"
```

### 4. Start the development server

```bash
npm run dev
```

Open **http://localhost:3000** in your browser.

On first startup, the server automatically materializes and defensively indexes the 13-entry sample corpus into `data/mc3-corpus/` from the bundled assets in `public/assets/aistudio/`.

## Running in Production

Build the frontend bundle and start the Express server natively on Node 22:

```bash
npm run build
NODE_ENV=production npm start
```

> **Windows (PowerShell):**
> ```powershell
> npm run build
> $env:NODE_ENV="production"; npm start
> ```

## Testing & Type-Checking

```bash
# Run unit tests (answer normalization, schema validation, exact-set citation grading, 2-hop retrieval)
npx tsx --test src/lib/rag-scoring.test.ts

# TypeScript type-check
npm run lint
```

## API Endpoints

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/corpus` | Returns the current corpus index summary and per-file metadata |
| `POST` | `/api/corpus/reindex` | Re-runs the Phase-1 defensive corpus indexer (`{ "reset": true }` restores default corpus) |
| `POST` | `/api/corpus/upload` | Uploads heterogeneous files (`multipart/form-data`) into a target folder and re-indexes |
| `DELETE` | `/api/corpus/file?path=...` | Deletes a user-uploaded corpus file and re-indexes |
| `GET` | `/api/corpus/raw?path=...` | Serves raw visual image assets for the document inspector |
| `POST` | `/api/query` | Executes a strict RAG query (`{ "query": "...", "queryId": "query_01" }`) |
| `GET` | `/api/benchmark/questions` | Returns the 10 sample evaluation benchmark queries |
| `POST` | `/api/benchmark/run-one` | Runs and grades a single benchmark query (`{ "queryId": "query_01" }`) |

## Project Structure

```text
├── server.ts                  # Express server & Vite middleware entry point
├── server/
│   ├── corpus-bootstrap.ts    # Materializes the 13-entry sample corpus on startup
│   ├── indexer.ts             # Defensive multi-format corpus walker & parser
│   └── rag-engine.ts          # Server-side Gemini RAG & multimodal extractor
├── src/
│   ├── App.tsx                # Workspace shell & navigation
│   ├── types/rag.ts           # Shared TypeScript interfaces
│   ├── lib/
│   │   ├── rag-scoring.ts     # Normalization, schema validation, grading & 2-hop retrieval
│   │   └── rag-scoring.test.ts
│   └── components/
│       ├── Sidebar.tsx
│       ├── QueryWorkbench.tsx
│       ├── CorpusIndexView.tsx
│       ├── DocumentPreviewPane.tsx
│       ├── EvaluationSuiteView.tsx
│       └── ContractSchemaView.tsx
├── public/assets/aistudio/    # Bundled reference corpus assets & sample questions
├── .env.example               # Environment variable template
└── package.json
```

## Notes for GitHub

- `.env` and `data/` are excluded via `.gitignore` so API keys and runtime-generated index files (including the `chmod 000` unreadable test file) are never committed.
- Keep `public/assets/aistudio/` committed so the bundled sample corpus and evaluation benchmark bootstrap automatically on any fresh clone.
