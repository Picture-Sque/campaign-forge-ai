# CampaignForge

**Replacing hours of manual content repurposing with a deterministic, agentic workflow.**

CampaignForge is an **Autonomous Content Factory** that ingests raw technical documents or web URLs and transforms them into high-converting, multi-channel marketing campaigns (Blogs, Social Threads, and Email Teasers) while strictly enforcing factual accuracy and brand integrity.

Unlike traditional LLM wrappers that hallucinate freely, CampaignForge employs a **LangGraph-driven multi-agent pipeline** featuring a feedback loop between specialized agents, grounded by deterministic guardrails.

---

## 🚀 Key MVP Features

- 📂 **Multi-modal Data Ingestion**: Seamlessly ingest information via raw text, file uploads (`.txt`, `.md`), or automated URL scraping using BeautifulSoup4.
- 🧠 **The "Ambiguity Brain"**: A Lead Researcher agent that not only extracts facts but also flags "marketing fluff" and vague, unquantified statements for human review.
- 🛡️ **Deterministic Guardrails**: An Editor-in-Chief agent that uses regex-based deterministic checks (e.g., preventing unverified pricing/currency mentions) before performing semantic LLM validation.
- ⚡ **Real-Time Agent UI**: A premium Next.js dashboard featuring SSE (Server-Sent Events) streaming, an "Active Agent Room" for status tracking, and a responsive side-by-side layout.
- 📱 **Adaptive Previews**: Instantly toggle between **Desktop** and **Mobile** views to visualize how your campaign assets look on different devices.
- 📦 **1-Click Asset Export**: Export your entire verified campaign—including individual text files and a structured JSON fact-sheet—as a single `.zip` bundle.

---

## 🏗️ Architectural Details

CampaignForge uses a decoupled, reactive architecture designed for scalability and reliability:

- **Frontend UI (Next.js 15+ + Tailwind CSS)**: A state-of-the-art dashboard that handles file processing, real-time streaming updates, and dynamic preview rendering.
- **Backend Orchestration (LangGraph + FastAPI)**: A robust Python backend managing a cyclic state machine that governs the agent assembly line and ensures loop-back on rejection.
- **LLM Engine (Llama 3.3 70B via Groq)**: Powered by Groq's high-speed inference for near-instant agent responses and superior reasoning capabilities.

### The Agent Assembly Line
1. **Lead Research Agent**: Parses technical data into a strict JSON Fact-Sheet and identifies ambiguities.
2. **Creative Copywriter Agent**: Drafts campaign assets based solely on verified facts.
3. **Editor-in-Chief Agent**: Validates drafts using a mix of deterministic Regex guardrails and LLM semantic cross-referencing.

---

## 🛠️ Quickstart Guide

### 1. Setup the Backend
1. Navigate to the `backend/` directory:
   ```bash
   cd backend
   ```
2. Create and activate a Python virtual environment:
   ```bash
   python -m venv venv
   # Windows:
   .\venv\Scripts\activate
   # macOS/Linux:
   source venv/bin/activate
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Configure your environment:
   Create a `.env` file in the `backend/` folder and add your Groq API key:
   ```env
   GROQ_API_KEY="gsk_your_actual_key_here"
   ```
5. Start the FastAPI server:
   ```bash
   uvicorn main:app --reload --port 8000
   ```

### 2. Setup the Frontend
1. Navigate to the `frontend/` directory:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the UI:
   ```bash
   npm run dev
   ```

### 3. Deploy Your First Campaign
Open **http://localhost:3000**, choose your input method (Text, File, or URL), and click **Deploy Agents**. Watch the researcher and copywriter work in real-time, and download your finalized, editor-approved campaign assets with one click!
