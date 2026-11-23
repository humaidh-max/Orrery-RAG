const SCHEMA_EXAMPLE = `{
  "answer": "4.3.2",
  "citations": [
    "logs/prod_inference_2026-09-02.log",
    "support/bug_database.csv"
  ],
  "confidence": 0.92
}`;

const REFUSAL_EXAMPLE = `{
  "answer": "",
  "citations": [],
  "confidence": 0.0
}`;

export function ContractSchemaView() {
  return (
    <div className="max-w-4xl space-y-8">
      <section className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
        <div className="space-y-1">
          <h2 className="font-display text-lg font-semibold text-slate-900">
            Strict Output Schema & Extraction Rules
          </h2>
          <p className="text-sm text-slate-600 leading-relaxed">
            Every query produces a deterministic three-field JSON object written to{' '}
            <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded text-slate-800">
              &lt;query-id&gt;_output.json
            </code>
            . No surrounding markdown fences, preambles, or conversational prose are permitted.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-slate-900">Multi-Hop Grounded Response</p>
            <pre className="p-4 rounded-md bg-slate-900 text-slate-100 font-mono text-xs leading-relaxed overflow-x-auto">
              {SCHEMA_EXAMPLE}
            </pre>
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-slate-900">Considered Refusal (Unanswerable)</p>
            <pre className="p-4 rounded-md bg-slate-900 text-slate-100 font-mono text-xs leading-relaxed overflow-x-auto">
              {REFUSAL_EXAMPLE}
            </pre>
          </div>
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-lg p-6 space-y-6">
        <h2 className="font-display text-lg font-semibold text-slate-900">
          Core Governance Directives
        </h2>

        <div className="divide-y divide-slate-200 text-sm">
          <div className="pb-4 space-y-1">
            <h3 className="font-display font-semibold text-slate-900">
              01. Value Completeness Without Prose
            </h3>
            <p className="text-slate-600 leading-relaxed">
              Return only the requested scalar value — number, error code, version, quarter, pin
              designator, board revision, or part number. Keep qualifiers that belong to the value
              (<code className="text-xs font-mono">Q3 FY27</code>,{' '}
              <code className="text-xs font-mono">REV-C2</code>,{' '}
              <code className="text-xs font-mono">ORR-FAN-2214-B</code>) while omitting full
              sentences.
            </p>
          </div>

          <div className="py-4 space-y-1">
            <h3 className="font-display font-semibold text-slate-900">
              02. Strict Citations — Necessity, Not Relevance
            </h3>
            <p className="text-slate-600 leading-relaxed">
              Cite a corpus-relative forward-slash path only if removing that document makes
              answering impossible. Exclude withdrawn revisions (such as{' '}
              <code className="text-xs font-mono">tq40_datasheet_r1_WITHDRAWN.pdf</code>) and
              topically adjacent release notes that do not carry a necessary link in the chain.
            </p>
          </div>

          <div className="py-4 space-y-1">
            <h3 className="font-display font-semibold text-slate-900">
              03. Honest Refusal on Encrypted or Missing Facts
            </h3>
            <p className="text-slate-600 leading-relaxed">
              When a fact resides solely inside an encrypted payload (e.g.{' '}
              <code className="text-xs font-mono">vendor/supplier_agreement_ENCRYPTED.pdf</code>) or
              is absent from readable documents, return an empty string answer, empty citation list,
              and <code className="text-xs font-mono">0.0</code> confidence. Never output prose
              such as &quot;I don&apos;t know&quot;.
            </p>
          </div>

          <div className="pt-4 space-y-1">
            <h3 className="font-display font-semibold text-slate-900">
              04. Defensive Per-File Corpus Traversal
            </h3>
            <p className="text-slate-600 leading-relaxed">
              Phase-1 indexing catches permission errors (<code className="text-xs font-mono">chmod 000</code>),
              encrypted PDF dictionaries (<code className="text-xs font-mono">/Encrypt</code>),
              unknown binary types, and empty directories per entry so one hostile file never
              aborts indexing of remaining documents.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
