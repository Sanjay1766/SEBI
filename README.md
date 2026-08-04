# IPO SHERPA — SEBI SME IPO Draft-Generator & Compliance Auditor

An AI-powered compliance workspace designed to help founders and financial teams prepare disclosure-ready SME IPO applications under SEBI (ICDR) Regulations, 2018, Chapter IX.

---

## Quick Start (2 Minutes)

```bash
# 1. Clone the repository
git clone https://github.com/Sanjay1766/SEBI.git
cd SEBI

# 2. Start Backend Server
cd backend
python -m venv venv
# On Windows:
venv\Scripts\activate
# On Linux/macOS:
# source venv/bin/activate

pip install -r requirements.txt
python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload

# 3. Start Frontend Server (in a second terminal)
cd ../frontend
npm install
npm run dev
```

Open your browser at **`http://localhost:5173`**.

---

## Architecture Overview

```
               ┌──────────────────────────────────────────────┐
               │           React / Vite Frontend              │
               │   Dashboard | Wizard | Banker | Compliance   │
               └──────────────────────┬───────────────────────┘
                                      │ REST API
               ┌──────────────────────▼───────────────────────┐
               │            FastAPI Backend Engine            │
               ├──────────────────────────────────────────────┤
               │ • ContradictionDetector (7 statutory checks) │
               │ • HallucinationGuard (Digit-level fact store)│
               │ • Banker Certification Store (Gated export)  │
               │ • Coverage Engine (60+ ICDR requirements)    │
               │ • Exporter (Schedule VI Part A/E DOCX + ZIP) │
               │ • Audit Logger (Append-only JSONL events)    │
               │ • Blockchain Anchoring (Polygon Amoy Testnet)│
               └──────────────────────────────────────────────┘
```

---

## SEBI Problem Statement Compliance Matrix

| Clause | SEBI's Words | Discharged By | Proof / Implementation | Status |
|:---|:---|:---|:---|:---:|
| **PS-1** | *"capture business, financial, legal particulars"* | Multi-section intake form + OCR extraction | `schema.json` with 60+ fields & `extractor.py` parsing statutory PDFs | **COMPLETE** |
| **PS-2** | *"generate disclosure-ready draft offer document"* | `exporter.py` SEBI Schedule VI Part A generator | DOCX export formatted in Times New Roman with 26 prospectus sections | **COMPLETE** |
| **PS-3** | *"accessible to promoters without specialist knowledge"* | Step-by-step guided wizard + statutory tooltips | Field tooltips citing exact SEBI ICDR clauses for every question | **COMPLETE** |
| **PS-4** | *"checks for accuracy and completeness"* | `HallucinationGuard` + `ContradictionDetector` + `CoverageScore` | 7 statutory consistency checks + digit-level numeric validation | **COMPLETE** |
| **PS-5** | *"preserve the role of authorised intermediaries"* | `CertificationStore` export gating | HTTP 403 export lock until all 11 sections certified by merchant banker | **COMPLETE** |
| **PS-6** | *"substantially complete draft"* | `CoverageScore` engine evaluating 60+ requirements | Live coverage score; "Substantially Complete" badge at >= 80% | **COMPLETE** |
| **PS-7** | *"significantly reducing preparation time"* | Automated document extraction & drafting wizard | Reduces machine drafting time from weeks to minutes | **PARTIAL** ⚠️ |
| **PS-8** | *"lowering dependence on intermediaries at early stage"* | Self-service intake wizard; banker joins for sign-off | Promoter fills form independently before banker review | **COMPLETE** |
| **PS-9** | *"more accessible for smaller enterprises"* | SEBI Chapter IX eligibility gate | Enforces post-issue capital <= 25 Cr & EBITDA track record | **COMPLETE** |
| **PS-10**| *"all material disclosure requirements"* | 60+ versioned SEBI ICDR requirements in `coverage.py` | `coverage_report.json` generated in ZIP bundle with clause refs | **PARTIAL** ⚠️ |
| **PS-11**| *"flag gaps or inconsistencies"* | `ContradictionDetector` (7 checks) + gap report | Catches issue size, promoter holding, GCP cap discrepancies | **COMPLETE** |
| **PS-12**| *"simple enough for a first-time issuer"* | Plain-English guided wizard with zero jargon | Step-by-step workflow requiring zero technical setup | **COMPLETE** |
| **PS-13**| *"broadening the pipeline of SMEs"* | Eligibility gate providing remediation feedback | Failed criteria returns specific gap list & action roadmap | **COMPLETE** |

> ⚠️ **Honest Partial Admissions**:
> - **PS-7**: Measures machine drafting speed in IPO Sherpa; does not include external CA auditing or legal due diligence cycles.
> - **PS-10**: Covers 60+ core statutory disclosures; specialized auditor-only Annexures require external CA sign-off.

---

## Key Differentiators

1. **Digit-Level Hallucination Guard** (`hallucination_guard.py`): Recursively verifies every numeric figure against the session fact store across unit conversions (Crores, Lakhs, units) to eliminate AI numerical hallucination.
2. **Statutory Contradiction Detector** (`consistency_checker.py`): Executes 7 automated consistency checks flagging discrepancies between form entries and extracted document filings (e.g. Issue size form vs Bank sanction letter).
3. **Gated Banker Certification Workflow** (`certification.py`): Preserves intermediary authority by gating DRHP ZIP exports behind section-by-section merchant banker sign-off.
4. **Blockchain Audit Trail** (`blockchain.py`): Anchors SHA-256 document hashes to the Polygon Amoy testnet for tamper-proof auditability.
5. **Abridged Prospectus & Export Bundle** (`exporter.py`): Generates both full Schedule VI Part A DRHP and 15-page Schedule VI Part E Abridged Prospectus alongside audit logs in a single ZIP package.

---

## Running Test Suite

Run the full pytest suite in the backend:

```bash
cd backend
.\venv\Scripts\python.exe -m pytest tests/ -v
```

Expected Output: **`33 passed in 0.54s`**.

---

## 10-Minute Judge Walkthrough Script

For a step-by-step live demo walkthrough guide for hackathon judges, refer to [`DEMO_SCRIPT.md`](DEMO_SCRIPT.md).
