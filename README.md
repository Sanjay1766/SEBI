# IPO SHERPA - SEBI SME IPO Draft-Generator & Compliance Auditor

An AI-powered compliance workspace designed to help founders and financial teams prepare SME IPO applications under SEBI ICDR Chapter IX regulations.

This tool extracts data from statutory documents using OCR and LLMs, cross-validates fields for regulatory inconsistencies, and auto-generates a drafted `.docx` prospectus.

---

## Prerequisites

Before you begin, ensure you have the following installed on your machine:

- **Python 3.9+**
- **Node.js (v18+) & npm**
- **Tesseract & Poppler** (Required for PDF OCR extraction)
  - *macOS:* `brew install poppler tesseract`
  - *Windows:* Download and install [Tesseract](https://github.com/UB-Mannheim/tesseract/wiki) and [Poppler](https://github.com/oschwartz10612/poppler-windows/releases/), and add them to your system PATH.

## User accounts and isolated workspaces

The application uses Supabase Auth and a Supabase database row for each user's saved workspace. It no longer supports the former shared local session file.

1. Create a Supabase project and enable **Email** authentication.
2. Run [`supabase/migrations/20260726_create_ipo_workspaces.sql`](supabase/migrations/20260726_create_ipo_workspaces.sql) in the Supabase SQL Editor.
3. Copy `backend/.env.example` to `backend/.env`, and set `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`.
4. Copy `frontend/.env.example` to `frontend/.env.local`, and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

Never place the Supabase service-role key in the frontend. If a key was previously committed, rotate it in its provider dashboard before deployment.

---

## Step 1: Environment Setup

This project uses Groq's fast LLM API to extract unstructured data from documents and draft narrative sections. Without an API key, the app will enter **Offline Demo Mode** and return static mock data.

> **Note:** Groq is used here only for **prototyping speed**. During the build-out phase, this will be swapped for a **local LLM** (via Ollama or similar) to keep sensitive financial/regulatory data on-device and support offline, privacy-first inference — in line with the project's local-inference-first design goal.

1. Get a free API key from [console.groq.com](https://console.groq.com/).
2. Navigate to the `backend` folder.
3. Create a file named `.env` and add your key:

   ```env
   GROQ_API_KEY=gsk_your_api_key_here
   ```

---

## Step 2: Running the Backend (FastAPI)

The backend handles document parsing, compliance validation, and document generation.

> **Note:** `requirements.txt` is located inside the `backend/` folder — make sure you've run `cd backend` first before installing dependencies.

1. Open a terminal and navigate into the backend directory:

   ```bash
   cd backend
   ```

2. Create a Python virtual environment:

   ```bash
   # macOS/Linux
   python3 -m venv venv

   # Windows
   python -m venv venv
   ```

3. Activate the virtual environment:

   ```bash
   # macOS/Linux
   source venv/bin/activate

   # Windows
   venv\Scripts\activate
   ```

   (You should see `(venv)` appear at the start of your terminal prompt.)

4. Install the required Python dependencies:

   ```bash
   pip install -r requirements.txt
   ```

   If you are missing the requirements file, install manually:

   ```bash
   pip install fastapi uvicorn groq pdfplumber python-docx pydantic python-dotenv python-multipart pytesseract pdf2image
   ```

5. Start the backend server:

   ```bash
   python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
   ```

   The backend will now be running at `http://127.0.0.1:8000`. Leave this terminal window open.

---

## Step 3: Running the Frontend (React/Vite)

The frontend provides the interactive compliance dashboard and drafting wizard.

1. Open a new terminal window and navigate to your frontend directory (where `package.json` is located).
2. Install the Node modules:

   ```bash
   npm install
   ```

3. Start the Vite development server:

   ```bash
   npm run dev
   ```

4. Open your browser and navigate to the URL provided in the terminal (usually `http://localhost:5173`).

---

## Troubleshooting

**My uploaded PDFs return the exact same "Apex Technochem" data every time**
Your backend cannot find a valid Groq API key and has fallen back to Demo Mode(Used only for prototyping speed). Ensure your `.env` file is in the `backend` folder, contains `GROQ_API_KEY=...`, and that you have restarted the Uvicorn server.

**`Error loading ASGI app. Could not import module "main".`**
You are running the Uvicorn command from the wrong directory. Ensure you `cd backend` before starting the server.

**`RuntimeError: Form data requires "python-multipart" to be installed.`**
FastAPI needs this package to accept file uploads. Run `pip install python-multipart` inside your active virtual environment.

**The frontend loads, but the dashboard chapters are completely missing**
Ensure you have a `schema.json` file located in your `backend` directory.
