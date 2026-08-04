# IPO Sherpa — 10-Minute Hackathon Judge Demo Script

This script provides a step-by-step 10-minute walkthrough for demonstrating **IPO Sherpa** to SEBI TechSprint hackathon judges.

---

## Pre-Demo Checklist

1. Start the FastAPI backend:
   ```bash
   cd backend
   .\venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
   ```
2. Start the Vite frontend:
   ```bash
   cd frontend
   npm run dev
   ```
3. Open browser at `http://localhost:5173`.

---

## 10-Minute Walkthrough Steps

### Step 1 (0:00 - 1:00) — Welcome & Filing Dashboard Overview
- **Action**: Open the Filing Dashboard (`/`). Point out the live SEBI Chapter IX banner.
- **Talking Point**: *"Welcome to IPO Sherpa. Our platform automates the SME IPO prospectus drafting and regulatory audit workflow under SEBI ICDR Chapter IX rules."*
- **Highlight**: Point out the live SEBI ICDR Coverage Score meter and missing requirement gaps.

### Step 2 (1:00 - 2:30) — SEBI Problem Statement Compliance Map
- **Action**: Click **"SEBI Compliance Map"** in the sidebar.
- **Talking Point**: *"We have explicitly mapped all 13 SEBI TechSprint problem statement clauses (PS-1 through PS-13) to our technical features and empirical proof."*
- **Highlight**: Show the matrix columns (Clause, Mandate Rationale, Technical Mechanism, Implementation Proof, Status). Point out our honest "Partial" status for PS-7 and PS-10, explaining that auditor-only annexures and legal due diligence cycles require CA/legal sign-off.

### Step 3 (2:30 - 4:00) — Contradiction Detection Engine
- **Action**: Click **"Filing Dashboard"** -> **"Run Validation Check"**.
- **Talking Point**: *"Our ContradictionDetector runs 7 statutory consistency checks cross-validating financial and identity figures between application forms and extracted document filings."*
- **Highlight**: Show flagged discrepancies:
  - **Issue Size Mismatch**: Form data vs Bank Sanction Letter.
  - **Promoter Holding Discrepancy**: Form data vs Extracted shareholding pattern.
  - Point out the exact difference calculation (e.g., `₹2.50 Cr gap`) and actionable statutory fix suggestions.

### Step 4 (4:00 - 5:30) — Digit-Level Hallucination Guard & Drafting Wizard
- **Action**: Navigate to the **Drafting Wizard** sections.
- **Talking Point**: *"One hallucinated number destroys trust in AI drafting. Our HallucinationGuard recursively indexes every allowed numeric figure in the session fact store across unit conversions (Crores, Lakhs, units) and retries LLM generation if unverified numbers appear."*
- **Highlight**: Show section drafts with yellow `[REQUIRES INPUT: description]` placeholders and red `⚠️[UNVERIFIED: number]` flags.

### Step 5 (5:30 - 6:30) — NLP Red Flag & Investor Protection Scan
- **Action**: Click **"Run Red Flag Scan"** in the Copilot / Audit panel.
- **Talking Point**: *"Our NLP engine scans narrative disclosures for vague claims ('market leader', 'rapidly growing') and generic boilerplate risk factors not tailored to the issuer."*
- **Highlight**: Review the severity-sorted red flags and actionable suggestions.

### Step 6 (6:30 - 7:30) — Merchant Banker Certification Workflow
- **Action**: Click **"Banker Certification"** in the sidebar.
- **Talking Point**: *"SEBI explicitly mandates preserving the role of authorized intermediaries. IPO Sherpa gates DRHP export until every certifiable prospectus section has received merchant banker sign-off."*
- **Highlight**: Show the red **EXPORT BLOCKED** banner. Click "Mark Reviewed" and "Certify" across sections to demonstrate the progress meter transitioning to green **EXPORT READY**.

### Step 7 (7:30 - 8:30) — Exporting the Complete ZIP Bundle
- **Action**: Click **"Download Export Bundle (.ZIP)"**.
- **Talking Point**: *"Once all sections are certified, the system compiles the full e-Filing bundle."*
- **Highlight**: Extract and view the ZIP contents:
  - `DRHP_Draft.docx` (Formatted under SEBI ICDR Schedule VI Part A with mandatory machine-assisted draft disclaimer)
  - `Abridged_Prospectus.docx` (Schedule VI Part E compliant 15-page summary)
  - `coverage_report.json`
  - `contradiction_findings.json`
  - `audit_log.jsonl`

### Step 8 (8:30 - 9:15) — Blockchain Anchoring & Audit Trail
- **Action**: Click **"Audit Trail Log"** in the sidebar.
- **Talking Point**: *"Every user event, validation run, certification, and export bundle SHA-256 hash is anchored on the Polygon blockchain for immutable auditability."*
- **Highlight**: Review the append-only JSONL log timeline and on-chain event status.

### Step 9 (9:15 - 9:45) — Peer Comparison & Valuation Benchmarks
- **Action**: Open the Basis of Issue Price section in the generated DRHP DOCX.
- **Talking Point**: *"The prospectus auto-populates peer comparison financial metrics (EPS, NAV, RoNW, P/E) against listed industry peers."*

### Step 10 (9:45 - 10:00) — Conclusion & Q&A
- **Talking Point**: *"IPO Sherpa empowers founders to prepare disclosure-ready SME IPO applications in record time while giving merchant bankers and SEBI complete auditability, hallucination protection, and statutory compliance."*
