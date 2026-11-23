import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import * as XLSX from 'xlsx';

export const CORPUS_ROOT = path.resolve(process.cwd(), 'data', 'mc3-corpus');
export const INDEX_FILE = path.resolve(process.cwd(), 'data', '.rag-index', 'index.json');
export const UPLOADED_ASSETS_DIR = path.resolve(process.cwd(), 'public', 'assets', 'aistudio');

export const BUNDLED_CORPUS_PATHS = new Set<string>([
  'specs/tq40_datasheet_r2.pdf',
  'specs/tq40_datasheet_r1_WITHDRAWN.pdf',
  'specs/backplane_pinout.png',
  'support/bug_database.csv',
  'support/asset_label.jpg',
  'support/rma_parts.xlsx',
  'engineering/ingest_service.py',
  'releases/meridian_release_notes.txt',
  'planning/roadmap_fy27.docx',
  'logs/prod_inference_2026-09-02.log',
  'vendor/supplier_agreement_ENCRYPTED.pdf',
  'vendor/internal_audit.txt',
  'archive',
]);

/**
 * Minimal ZIP builder using Node's built-in zlib so we can write a 100% spec-valid
 * OOXML .docx file readable by mammoth without external zip binaries.
 */
function buildZipBuffer(entries: Array<{ name: string; content: string | Buffer }>): Buffer {
  const crcTable = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    crcTable[i] = c >>> 0;
  }

  function crc32(buf: Buffer): number {
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf8');
    const rawBuf = Buffer.isBuffer(entry.content)
      ? entry.content
      : Buffer.from(entry.content, 'utf8');
    const compressed = zlib.deflateRawSync(rawBuf);
    const crc = crc32(rawBuf);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(8, 8); // deflate
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(rawBuf.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, nameBuf, compressed);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(8, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(rawBuf.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);

    centralParts.push(centralHeader, nameBuf);
    offset += localHeader.length + nameBuf.length + compressed.length;
  }

  const centralDir = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDir.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDir, eocd]);
}

function createRoadmapDocx(destPath: string): void {
  const paragraphs = [
    'Orrery Systems — FY27 Accelerator Hardware Roadmap',
    'Document Classification: Internal Engineering & Product Planning (Revision 2026-09)',
    'TQ-40 "Sable" Accelerator: General Availability in production across tier-1 hyperscale deployments.',
    'TQ-50 "Cinder" Refresh: Engineering validation completes Q1 FY27; limited pilot shipments begin Q2 FY27.',
    'TQ-60 "Helios" Next-Gen Accelerator: Tape-out completed; customer sampling enters in Q3 FY27 with general availability targeted for Q1 FY28.',
    'Software Alignment: Meridian 4.3.x branch supports TQ-40 production fleet; Meridian 5.0 brings initial TQ-60 bring-up support ahead of Q3 FY27 sampling.',
  ];

  const bodyXml = paragraphs
    .map(
      (p) =>
        `<w:p><w:r><w:t>${p
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')}</w:t></w:r></w:p>`
    )
    .join('');

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>${bodyXml}<w:sectPr/></w:body>
</w:document>`;

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

  const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  const docxBuffer = buildZipBuffer([
    { name: '[Content_Types].xml', content: contentTypesXml },
    { name: '_rels/.rels', content: relsXml },
    { name: 'word/document.xml', content: documentXml },
  ]);

  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.writeFileSync(destPath, docxBuffer);
}

function createRmaPartsXlsx(destPath: string): void {
  const rows = [
    ['part_number', 'platform', 'component', 'field_replaceable', 'notes'],
    ['ORR-FAN-1102-A', 'TQ-20', 'Legacy single-rotor cooling fan assembly', 'Yes', 'Discontinued after TQ-20 EOL'],
    ['ORR-FAN-2214-B', 'TQ-40', 'Dual-rotor field-replaceable fan assembly', 'Yes', 'Standard FRU for TQ-40 Sable chassis'],
    ['ORR-PWR-4100-C', 'TQ-40', '12V-2x6 auxiliary power harness', 'Yes', 'Rated for 410 W TBP continuous'],
    ['ORR-TIM-0901-A', 'TQ-40', 'Phase-change thermal interface pad kit', 'No', 'Depot replacement only'],
    ['ORR-BRK-2040-A', 'TQ-40', 'Full-height PCIe retention bracket', 'Yes', 'Included with chassis RMA kit'],
  ];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'RMA_Parts');

  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  fs.writeFileSync(destPath, buf);
}

function createProdInferenceLog(destPath: string): void {
  const logContent = [
    '2026-09-02T14:19:02Z INFO  node=sable-rack04-n07 service=inference-daemon firmware=4.3.1 status=nominal die_temp_c=78',
    '2026-09-02T14:20:45Z INFO  node=sable-rack04-n07 batch_profile=small-batch-sustained queue_depth=11 die_temp_c=89',
    '2026-09-02T14:21:51Z WARN  node=sable-rack04-n07 pin=THERM_ALERT# asserted=low die_temp_c=95 threshold_c=94',
    '2026-09-02T14:22:08Z ERROR node=sable-rack04-n07 event=thermal_throttle_engaged code=E7731 clock_mhz=1120 action=clamped_tbp',
    '2026-09-02T14:22:09Z WARN  node=sable-rack04-n07 escalation=known_issue_match ticket=ORR-1847 message="Thermal throttle triggered under sustained small-batch workload; refer to bug tracker"',
    '2026-09-02T14:24:30Z INFO  node=sable-rack04-n07 event=thermal_throttle_cleared die_temp_c=82 clock_mhz=1850',
  ].join('\n') + '\n';

  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.writeFileSync(destPath, logContent, 'utf8');
}

/**
 * Ensures the complete 13-entry MC-3 corpus exists on disk under data/mc3-corpus/,
 * using the exact uploaded assets for all 9 attached corpus files plus genuine
 * .docx, .xlsx, .log, and empty archive/ directory matching sample-questions.json.
 */
export function ensureBundledCorpus(forceReset = false): void {
  if (forceReset && fs.existsSync(CORPUS_ROOT)) {
    // Restore permissions on unreadable files before removal
    const auditFile = path.join(CORPUS_ROOT, 'vendor', 'internal_audit.txt');
    if (fs.existsSync(auditFile)) {
      try {
        fs.chmodSync(auditFile, 0o644);
      } catch {
        // Ignore
      }
    }
    fs.rmSync(CORPUS_ROOT, { recursive: true, force: true });
  }

  fs.mkdirSync(CORPUS_ROOT, { recursive: true });

  const copyPairs: Array<[string, string]> = [
    ['tq40_datasheet_r2_77192a1e.pdf', 'specs/tq40_datasheet_r2.pdf'],
    ['tq40_datasheet_r1_WITHDRAWN_d6c6a544.pdf', 'specs/tq40_datasheet_r1_WITHDRAWN.pdf'],
    ['backplane_pinout_ce8cfa35.png', 'specs/backplane_pinout.png'],
    ['bug_database_a160e2d0.csv', 'support/bug_database.csv'],
    ['asset_label_4a03a914.jpg', 'support/asset_label.jpg'],
    ['ingest_service_e286963b.py', 'engineering/ingest_service.py'],
    ['meridian_release_notes_597ba8a0.txt', 'releases/meridian_release_notes.txt'],
    ['supplier_agreement_ENCRYPTED_2709c9d3.pdf', 'vendor/supplier_agreement_ENCRYPTED.pdf'],
    ['internal_audit_da8a12a2.txt', 'vendor/internal_audit.txt'],
  ];

  for (const [srcName, relDest] of copyPairs) {
    const srcPath = path.join(UPLOADED_ASSETS_DIR, srcName);
    const destPath = path.join(CORPUS_ROOT, relDest);
    if (!fs.existsSync(destPath) && fs.existsSync(srcPath)) {
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.copyFileSync(srcPath, destPath);
    }
  }

  const roadmapPath = path.join(CORPUS_ROOT, 'planning', 'roadmap_fy27.docx');
  if (!fs.existsSync(roadmapPath)) {
    createRoadmapDocx(roadmapPath);
  }

  const rmaPath = path.join(CORPUS_ROOT, 'support', 'rma_parts.xlsx');
  if (!fs.existsSync(rmaPath)) {
    createRmaPartsXlsx(rmaPath);
  }

  const logPath = path.join(CORPUS_ROOT, 'logs', 'prod_inference_2026-09-02.log');
  if (!fs.existsSync(logPath)) {
    createProdInferenceLog(logPath);
  }

  // Empty directory case per README.txt
  const archiveDir = path.join(CORPUS_ROOT, 'archive');
  fs.mkdirSync(archiveDir, { recursive: true });

  // Simulate chmod 000 unreadable file per README.txt
  const auditPath = path.join(CORPUS_ROOT, 'vendor', 'internal_audit.txt');
  if (fs.existsSync(auditPath)) {
    try {
      fs.chmodSync(auditPath, 0o000);
    } catch {
      // Some container filesystems ignore chmod 000; our indexer also enforces mode/DAC check
    }
  }
}
