# IPO Sherpa — SEBI SME IPO Draft-Generator & Compliance Auditor

An AI-assisted workspace that takes a founder from "we're thinking about an SME IPO" to a
disclosure-ready **Draft Abridged Prospectus (DOCX)**, formatted to match real SEBI-filed
abridged prospectuses — with statutory document extraction, gap/coverage scoring, contradiction
detection, hallucination guarding, banker sign-off gating, and a full audit trail along the way.

It is explicitly **not** a substitute for a SEBI-registered Category I Merchant Banker — it
accelerates and de-risks the drafting stage that precedes banker review, and is built to keep
that intermediary role intact (exports are gated behind section-by-section certification).

---

## Contents

- [Quick Start](#quick-start)
- [How it fits together](#how-it-fits-together)
- [End-to-end workflow](#end-to-end-workflow)
- [Backend module reference](#backend-module-reference)
- [Data model — `schema.json`](#data-model--schemajson)
- [Document extraction pipeline](#document-extraction-pipeline)
- [API reference](#api-reference)
- [Frontend structure](#frontend-structure)
- [Testing](#testing)
- [Docker / deployment details](#docker--deployment-details)
- [Environment variables](#environment-variables)
- [Project structure](#project-structure)

---

## Quick Start

### Docker (one command, zero config)

Requires [Docker](https://docs.docker.com/get-docker/) and Docker Compose (bundled with Docker
Desktop / Rancher Desktop).

```bash
git clone https://github.com/Sanjay1766/SEBI.git
cd SEBI
docker compose up
```

- **Backend** → `http://localhost:8000` (health check at `/health`)
- **Frontend** → `http://localhost:5173`

Runs out of the box — no API keys, no Supabase, no `.env` file needed. Anything not configured
falls back to an offline/local mode (rule-based extraction instead of LLM calls, a local
`session_state.json` instead of Supabase-backed workspaces, mocked blockchain anchoring). To
enable live LLM extraction, Supabase-backed multi-user workspaces, or real blockchain anchoring,
copy [`.env.example`](.env.example) to `.env` in the repo root and fill in what you want before
running `docker compose up` (or `docker compose up --build` to pick up changes to an existing
stack).

The first build takes a few minutes — OCR models (PaddleOCR), the sentence-transformers embedding
model, and ChromaDB's embedding model are all downloaded and cached into the image at *build*
time, so every container start afterward is instant and fully offline. State that the app writes
at runtime (the demo session, audit log, uploaded files, seeded ChromaDB corpus) is kept in named
Docker volumes, so `docker compose down && docker compose up` does **not** wipe an in-progress
session.

```bash
docker compose up      # start
docker compose down    # stop (data persists in named volumes)
```

### Manual (2 minutes)

```bash
git clone https://github.com/Sanjay1766/SEBI.git
cd SEBI

# Backend
cd backend
python -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt
python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload

# Frontend (second terminal)
cd ../frontend
npm install
npm run dev
```

Open `http://localhost:5173`.

---

## How it fits together

```
┌────────────────────────────────────────────────────────────────────────┐
│                      React 19 / Vite Frontend (frontend/)              │
│  SplashScreen → AuthScreen → Dashboard ⇄ Uploader ⇄ Wizard (10 tabs)    │
│         ⇄ BankerDashboard ⇄ Copilot (AI chat) ⇄ AuditTrail             │
└────────────────────────────────┬─────────────────────────────────────┘
                                  │ REST (fetch, JWT bearer or demo user)
┌────────────────────────────────▼─────────────────────────────────────┐
│                      FastAPI Backend (backend/main.py)                │
│                                                                        │
│  Document upload → extractor.py (10 doc types, pdfplumber/OCR/LLM)    │
│         → session["extracted_data"][doc_type], merged into form_data  │
│                                                                        │
│  validator.py     — per-field completeness → filing_readiness score   │
│  coverage.py       — 55 named SEBI ICDR requirements → gap list       │
│  consistency_checker.py — 7+ cross-document contradiction checks      │
│  financial_ratio_checker.py — restated-financials ratio audit         │
│  nlp_analyzer.py   — semantic matching, entity extraction, red flags  │
│  hallucination_guard.py — verifies every LLM-drafted number is real   │
│  generator.py      — Draft Abridged Prospectus DOCX (SEBI-format)     │
│  exporter.py        — full DRHP + Abridged Prospectus + ZIP bundle    │
│  certification.py   — per-section banker sign-off, gates export       │
│  audit_log.py        — append-only JSONL of every material action     │
│  blockchain.py        — SHA-256 anchoring to Polygon Amoy testnet     │
│  verifiable_credentials.py — W3C DID/VC issuance per uploaded doc     │
│  rag_engine.py         — ChromaDB semantic search over ICDR corpus    │
│  sebi_circulars.py      — regulatory-change alert feed                │
│  due_diligence.py, peer_comparison.py, version_tracker.py, ps_mapping.py │
└────────────────────────────────────────────────────────────────────────┘
```

Session state (`form_data`, `extracted_data`, `uploaded_files`) lives per-user, persisted to
Supabase when configured, or to a local `session_state.json` otherwise. Every backend feature
reads from the same merged session dict — `extracted_data` values are overridden by anything the
user typed manually in the wizard.

---

## End-to-end workflow

1. **Upload statutory documents** (Document Vault tab) — Certificate of Incorporation, GST
   registration, PAN/TAN, restated financial statements, MOA/AOA, Register of Members / cap
   table, DIR-12 / board resolutions, a legal-counsel litigation schedule, an industry report,
   and a sales/GST sales register. Each is OCR'd and LLM-extracted in the background
   (`job_manager.py` runs it as a polled async job so large scans don't block the UI).
2. **Fill the Drafting Wizard** (10 tabs: Cover Page, General Info, Board & Promoters, Capital
   Structure, Objects of the Issue, Business Operations, Financials & KPIs, Risk Disclosures) —
   every field auto-fills from extraction where possible; anything `source_hint: "manual"` in
   `schema.json` (business decisions, CA certificates, banker/legal sign-off items) is never
   auto-filled and is called out with an inline note explaining why.
3. **Live validation** — `validator.py` computes a `filing_readiness` score (blocking fields
   only, capped when contradictions are open) and an `overall_completeness` score (all required
   fields), plus a per-section AI risk score. `coverage.py` separately tracks 55 named,
   clause-referenced SEBI ICDR requirements and splits gaps into `fill_type: "manual"` (needs a
   human decision/sign-off) vs `"extracted"` (needs a document upload) so the UI can prompt
   correctly.
4. **AI Copilot & contradiction detection** — `consistency_checker.py` flags cross-field/
   cross-document conflicts (e.g. issue size in the form vs. a bank sanction letter, promoter
   shareholding sums, GCP exceeding the 25%-of-gross-proceeds cap); `Copilot.jsx` surfaces these
   in a chat-style assistant that can apply suggested fixes directly to the form.
5. **Generate the draft** — `generator.py` renders a Draft Abridged Prospectus `.docx` matching
   the section order, table styling, banner colors, and border rules of real SEBI-filed abridged
   prospectuses (extracted directly from a reference filing's OCXML, not guessed). Fields that
   are still empty render as `[MISSING: upload X to populate]` or
   `[REQUIRES BANKER/LEGAL INPUT: ...]` inline, instead of silently omitting the section.
6. **Banker certification** — `certification.py` requires each of the document's sections to be
   explicitly reviewed and certified before a full export bundle can be produced — preserving the
   merchant banker's statutory role rather than letting the tool auto-file anything.
7. **Export & anchor** — `exporter.py` builds a ZIP bundle (DRHP + Abridged Prospectus + coverage
   report + audit log), and `blockchain.py` anchors a SHA-256 hash of the final document to the
   Polygon Amoy testnet (or runs in a deterministic mock mode if no RPC/key is configured) for a
   tamper-evident timestamp.

---

## Backend module reference

| Module | Responsibility |
|---|---|
| `main.py` | FastAPI app: ~50 REST endpoints, session load/save (Supabase or local JSON fallback), auth (`get_current_user` — JWT bearer or a fixed demo user), rate-limiting middleware. |
| `extractor.py` | Document → structured JSON. pdfplumber text → OCR fallback (PaddleOCR primary, pytesseract secondary) → LLM extraction (JSON mode) with a regex-based fallback when no LLM key is configured. Table-heavy doc types (financials, cap table, litigation schedule) go through a 3-tier table extractor first (camelot stream → camelot lattice → tabula) before falling back to plain text. |
| `llm_client.py` | Single abstraction over Groq / OpenAI / Anthropic / Ollama — swapping providers is a `.env` change, no code edits. |
| `schema.json` | The single source of truth for every field in the wizard: 21 sections, 102 fields, each with `data_type` (string/number/date/boolean/select/list/table), `source_hint` (which doc type extracts it, or `"manual"`), and a `kpi_sector_templates` map (Manufacturing / NBFC / Jewellery & Trading / Services each get a different KPI field set). |
| `validator.py` | Computes `filing_readiness` (blocking fields, capped by open contradictions) and `overall_completeness` (all required fields) scores, per-section AI risk scores, and merges in the financial-ratio audit. |
| `coverage.py` | 55 named, individually clause-referenced SEBI ICDR requirements (`SEBI_REQUIREMENTS`), each tagged `fill_type: "manual"` or `"extracted"` — powers the gap-list the UI shows and the `[MISSING]` vs `[REQUIRES BANKER/LEGAL INPUT]` markers in the generated document. |
| `consistency_checker.py` | `ContradictionDetector` — cross-checks form data against extracted document data and against itself (company name mismatches, revenue inconsistency, date logic, capital structure math, shareholding sums summing to 100%, objects-of-issue vs. total issue size, PAN/GSTIN format, price-band width, narrative quality). |
| `financial_ratio_checker.py` | Recomputes standard financial ratios from the restated financials and flags implausible/inconsistent values. |
| `hallucination_guard.py` | Wraps every LLM-drafted narrative: extracts every number the LLM used, verifies each one traces back to a real number already present in the session (across unit conversions), and retries/falls back to a template if it can't. |
| `nlp_analyzer.py` | Semantic text matching (sentence-transformers), named-entity extraction, readability/quality scoring, narrative summarization, full-session NLP analysis, and `generate_sebi_risk_factors` (drafts internal/external risk factors from session facts, used by the Wizard's "Auto-Generate Risk Factors" button). |
| `generator.py` | Builds the Draft Abridged Prospectus `.docx` — cover page (issuer identity, offer mechanics, BRLM/registrar, bid/offer period), then the 12-part "salient features" summary (business overview, industry, promoters, objects of the offer, shareholding, restated financials, KPIs, risk factors, WACA, board/KMP, auditor qualifications, litigation). Table borders, header shading (`#D09E73` tan for cover-page mechanics, `#D9D9D9` gray for content tables), and fonts were extracted directly from a real filed abridged prospectus's DOCX XML, not estimated. |
| `exporter.py` | Generates the full Schedule VI Part A DRHP, the Schedule VI Part E Abridged Prospectus, a combined ZIP export bundle (documents + coverage report + audit log), and an e-filing package. |
| `certification.py` | `CertificationStore` — per-section reviewed/certified state; gates bundle export until every section is signed off, preserving the merchant banker's role. |
| `audit_log.py` | Append-only JSONL audit trail per user (`audit/{user_id}.jsonl`) of every material action. |
| `blockchain.py` | SHA-256 hashing + anchoring of documents/prospectus versions to the Polygon Amoy testnet via `web3.py`, with dynamic gas pricing and retry/backoff; runs in a deterministic mock mode when no RPC URL/private key is configured. |
| `verifiable_credentials.py` | Issues W3C-spec Verifiable Credentials (DID-based) for each uploaded/verified document. |
| `rag_engine.py` | `SEBIRAGEngine` — ChromaDB-backed semantic search over a curated SEBI ICDR Chapter IX / Schedule VI corpus (`sebi_icdr_corpus.py`), used by the Copilot for regulation-grounded answers. |
| `sebi_circulars.py` | Fetches/monitors SEBI regulatory circulars for the alert banner shown in the UI. |
| `due_diligence.py` | Generates the Form A due-diligence certificate and a due-diligence summary for the lead manager. |
| `peer_comparison.py` | Dynamic peer-company valuation/accounting comparison (Schedule VI-based). |
| `version_tracker.py` | Snapshots and diffs prospectus revisions, tracking SEBI observations across versions. |
| `job_manager.py` | Thread-safe background job queue so large document extractions don't block the upload request; the frontend polls `/api/jobs/{id}/status`. |
| `ps_mapping.py` | Maps the project's features back to the original SEBI hackathon problem-statement clauses, for the `/api/ps-mapping` endpoint. |

---

## Data model — `schema.json`

Every field the app knows about is declared once in `backend/schema.json`, grouped into 21
sections (Cover Page, Offer Details, Risk Factors, General Info, Capital Structure, Objects of
the Issue, Business Overview, Industry Overview, Promoters, Board & KMP, Related Party
Transactions, Financial Statements, KPIs, Shareholding Pattern, WACA, Legal Disclosures,
Compliance Certificates, Material Contracts, Declaration, Definitions, Summary of the Offer).

Each field carries:

- `data_type` — `string` / `number` / `date` / `boolean` / `select` / `list` / `table` (lists and
  tables carry an `item_fields` sub-schema describing each row's columns).
- `source_hint` — which extraction pipeline populates it (`incorporation`, `gst`, `financials`,
  `moa_aoa`, `cap_table`, `dir12`, `litigation_schedule`, `industry_report`, `sales_register`,
  `compliance`) or `"manual"` for anything that can never be auto-extracted (business decisions,
  CA certificates, banker/legal sign-off items) or `"derived"` for values computed from other
  fields.
- `required` / `blocking` — whether it's needed for `overall_completeness` vs. the stricter
  `filing_readiness` score.

`kpi_sector_templates` is a separate top-level map (not tied to one field) giving each of four
sector classifications — **Manufacturing**, **NBFC**, **Jewellery & Trading**, **Services** — its
own KPI field set (e.g. NBFCs get AUM/NIM/CRAR/credit-rating; manufacturers get inventory days,
order book, installed capacity), since SEBI KPI disclosures are inherently sector-dependent and a
single universal list would misrepresent most issuers.

`coverage.py`'s `SEBI_REQUIREMENTS` is a parallel, hand-maintained list of 55 clause-referenced
disclosure requirements (not auto-derived from `schema.json`) — it's what powers the live gap
score and the `[MISSING]` / `[REQUIRES BANKER/LEGAL INPUT]` markers in the generated document.

---

## Document extraction pipeline

`extractor.py` handles 10 document types, each following the same fallback chain:

```
pdfplumber (text-based PDF)
   │  (empty/scanned)
   ▼
PaddleOCR (primary OCR)  →  pytesseract (secondary OCR fallback)
   │
   ▼
LLM extraction (JSON mode, provider-agnostic via llm_client.py)
   │  (no LLM key configured, or LLM call fails)
   ▼
Regex/keyword fallback — returns null (not fabricated data) for anything it can't find,
and lists every missing field in a `missing_fields` array so the UI shows an honest gap
instead of silently wrong data.
```

| Doc type | Populates |
|---|---|
| `incorporation` | CIN, company name, incorporation date, registered office, company type |
| `gst` | GSTIN, declared turnover, registration date, filing status |
| `compliance` | PAN, PAN name, TAN |
| `financials` | All restated 3-year financial fields (equity capital, net worth, revenue, EBITDA, PAT, EPS, RoNW, NAV, borrowings, cash flows), auditor name/membership/qualifications |
| `moa_aoa` | Authorized capital, face value per share, main objects clause |
| `cap_table` (Register of Members) | Pre-offer shareholding table, promoter group members, aggregate promoter % |
| `dir12` (board resolutions) | Directors (name/DIN/designation/independence), KMP |
| `litigation_schedule` | Structured litigation summary table — deliberately *not* free-text-scraped; only accepted from a dedicated legal-counsel schedule |
| `industry_report` (CRISIL/CARE/ICRA) | Industry market size, CAGR, report source — best-effort, confidence flagged low since report formats vary widely |
| `sales_register` | Top-5 customer revenue concentration table, key geographies served |

Financial statements, cap tables, and litigation schedules additionally go through a 3-tier
structured-table extractor (`extract_financial_tables`) — camelot stream → camelot lattice
(needs Ghostscript) → tabula (needs a JRE) — before falling back to raw text, since these
documents are fundamentally row/column data where plain text scraping risks pairing the wrong
number with the wrong label.

---

## API reference

All endpoints are under `/api/*` except `/health`. Auth is a `Authorization: Bearer <token>`
header (Supabase JWT when configured) or a fixed demo user when unauthenticated — every route
works with zero login for local/offline use.

**Session & schema**
`GET /api/schema` · `GET /api/session` · `POST /api/session` · `POST /api/session_sync` ·
`POST /api/session/reset` (`DELETE /api/session`)

**Documents**
`POST /api/upload` · `GET /api/jobs/{job_id}/status` · `GET /api/ocr_status` ·
`GET /api/credentials/{doc_type}` (W3C Verifiable Credential)

**Drafting assistance**
`POST /api/copilot` · `POST /api/draft` (single-field AI draft) ·
`POST /api/generate-risk-factors` · `POST /api/rag/query`

**Validation & compliance**
`GET /api/validate` · `POST /api/validate/hallucination` · `POST /api/validate/fix-suggestion` ·
`GET /api/coverage` · `GET /api/regulatory_alerts` · `GET /api/ps-mapping`

**NLP**
`POST /api/nlp/redflag` · `POST /api/nlp/analyze` · `POST /api/nlp/explain`

**Generation & export**
`GET|POST /api/generate` (Draft Abridged Prospectus DOCX) · `GET /api/export/bundle` (ZIP)

**Certification workflow**
`POST /api/certification/{section_key}/review` ·
`POST /api/certification/{section_key}/certify` ·
`POST /api/certification/{section_key}/uncertify` · `GET /api/certification/status`

**Audit & blockchain**
`GET /api/audit` · `GET /api/blockchain/status` · `GET /api/blockchain/trail` ·
`GET /api/blockchain/verify/document/{doc_hash}` ·
`GET /api/blockchain/verify/prospectus/{draft_hash}`

**Ancillary engines**
`GET /api/due_diligence` · `POST /api/peer_comparison` · `GET /api/version_tracker` ·
`POST /api/version_tracker/snapshot` · `POST /api/approvals` ·
`POST /api/dpi/digilocker/simulate` · `GET /api/market/stats`

---

## Frontend structure

React 19 + Vite + Tailwind, single-page app (`App.jsx` owns all top-level state and routes
between views by a simple `activeTab` string — no router).

| Component | Purpose |
|---|---|
| `SplashScreen.jsx` | Animated boot sequence shown once on load. |
| `AuthScreen.jsx` | Supabase auth (falls back to demo mode if Supabase isn't configured). |
| `Dashboard.jsx` | Filing-readiness overview: scores, section status, contradiction list, quick actions. |
| `Uploader.jsx` | Document Vault — one card per document type (10 types), drag-and-drop upload, background job progress, extracted-field preview, W3C VC inspector. |
| `Wizard.jsx` | The drafting form itself — 10 tabs mirroring `schema.json`'s sections. Renders scalar fields, a generic list/table row-editor for `list`/`table` fields, a sector-KPI picker, source badges (auto-extracted vs. manual), and inline notes on any field that can never be auto-filled. |
| `Copilot.jsx` | Chat-style AI assistant panel; can apply its own suggestions directly to form fields. |
| `BankerDashboard.jsx` | Merchant-banker view: section-by-section review/certify/uncertify workflow gating export. |
| `DueDiligenceManager.jsx` | Form A due-diligence certificate generation UI. |
| `ComplianceMap.jsx`, `ComplianceScoreMeter.jsx` | Visual compliance/coverage indicators. |
| `RegulatoryAlertBanner.jsx` | Surfaces live SEBI circular alerts relevant to the current session. |
| `AuditTrail.jsx` | Renders the append-only audit log. |
| `components/ui/` | Small shared primitives (`Badge`, `Card`, `StatTile`). |

---

## Testing

```bash
cd backend
python -m pytest tests/ -v
```

Covers `certification.py`, `consistency_checker.py`, `coverage.py`, `hallucination_guard.py`,
and `nlp_analyzer.py` (33 tests total).

---

## Docker / deployment details

- **Backend** (`backend/Dockerfile`) — multi-stage build on `python:3.13-slim`. All heavy models
  (PaddleOCR, sentence-transformers, ChromaDB's embedding model) are downloaded and cached
  **at build time**, not on first request, so a fresh container starts fully offline-capable
  with no first-request latency spike. Runtime state directories (`session_state.json`,
  `temp_uploads/`, `audit/`, `chroma_db/`) are pre-created in the image so the named volumes
  `docker-compose.yml` mounts onto them bind correctly.
- **Frontend** (`frontend/Dockerfile`) — multi-stage build: Vite build in a `node:20-alpine`
  stage, served statically by `nginx:alpine` with SPA fallback routing (`nginx.conf`).
  `VITE_API_URL`/`VITE_SUPABASE_*` are baked into the JS bundle at *build* time (Vite build args),
  not read at container runtime — rebuild the image if you change them.
- **docker-compose.yml** — one command brings up both services; the frontend waits for the
  backend's healthcheck before starting. Named volumes: `backend-model-cache` /
  `backend-paddlex-cache` (downloaded ML models, survive rebuilds), and
  `backend-session-state` / `backend-uploads` / `backend-audit-log` / `backend-chroma-db`
  (runtime state — an in-progress session, uploaded files, the audit trail, and the seeded
  regulation corpus all survive `docker compose down && up`).

---

## Environment variables

See [`.env.example`](.env.example) (root, for `docker compose up`) or
[`backend/.env.example`](backend/.env.example) (for manual/local runs) for the full list with
inline docs. Summary:

| Variable | Purpose | Required? |
|---|---|---|
| `LLM_PROVIDER` | `groq` \| `openai` \| `anthropic` \| `ollama` | No — defaults to `groq`; without a valid key the app runs in offline/template mode |
| `LLM_MODEL` | Override the default model for the selected provider | No |
| `GROQ_API_KEY` / `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | Provider API key | Only for the selected provider |
| `OLLAMA_BASE_URL` | Local Ollama server URL | Only if `LLM_PROVIDER=ollama` |
| `POLYGON_RPC_URL`, `BLOCKCHAIN_PRIVATE_KEY`, `BLOCKCHAIN_CONTRACT_ADDRESS` | Real Polygon Amoy anchoring | No — mocks deterministically if unset |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` | Multi-user, persisted workspaces | No — falls back to a local `session_state.json` |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Frontend Supabase client (build-time) | No |
| `CORS_ORIGINS`, `HOST`, `PORT` | Backend server config | No — sensible local defaults |

---

## Project structure

```
SEBI/
├── backend/
│   ├── main.py                  FastAPI app & all API routes
│   ├── schema.json              Field/section data model (21 sections, 102 fields)
│   ├── extractor.py             Document → structured data (10 doc types)
│   ├── generator.py             Draft Abridged Prospectus DOCX generator
│   ├── exporter.py              Full DRHP + Abridged Prospectus + ZIP bundle
│   ├── validator.py             Completeness / filing-readiness scoring
│   ├── coverage.py              55 named SEBI ICDR requirements + gap engine
│   ├── consistency_checker.py   Cross-field/cross-document contradiction checks
│   ├── financial_ratio_checker.py
│   ├── hallucination_guard.py   Digit-level LLM fact verification
│   ├── nlp_analyzer.py          Semantic matching, entities, risk-factor drafting
│   ├── llm_client.py            Provider-agnostic LLM abstraction
│   ├── certification.py         Banker sign-off workflow / export gate
│   ├── audit_log.py             Append-only audit trail
│   ├── blockchain.py            Polygon Amoy SHA-256 anchoring
│   ├── verifiable_credentials.py
│   ├── rag_engine.py, sebi_icdr_corpus.py    ICDR semantic search
│   ├── sebi_circulars.py        Regulatory alert feed
│   ├── due_diligence.py, peer_comparison.py, version_tracker.py, ps_mapping.py
│   ├── job_manager.py           Background extraction job queue
│   ├── tests/                   pytest suite (33 tests)
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── App.jsx              Top-level state, routing, session sync
│   │   ├── components/          Wizard, Uploader, Dashboard, Copilot, BankerDashboard, ...
│   │   ├── api.js, config.js, supabase.js
│   │   └── data/icdrRegulations.js
│   └── Dockerfile, nginx.conf
├── draft/                       Reference SEBI-filed abridged prospectus samples
├── docker-compose.yml
├── .env.example
└── DEMO_SCRIPT.md               Guided walkthrough script
```
