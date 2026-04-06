# CampaignForge: Autonomous Content Factory

## The Problem

Marketing teams waste countless hours manually repurposing dense technical documentation into multi-channel campaigns using standard LLMs that frequently hallucinate features and pricing. There is a critical need for an automated system that scales content production while enforcing strict, deterministic factual accuracy.

---

## The Solution

CampaignForge is a **LangGraph multi-agent pipeline** that autonomously transforms raw product documentation into a complete, publish-ready marketing campaign:

- **Researcher Agent** — Scrapes and semantically extracts structured product facts (value propositions, key benefits) from URLs or uploaded files.
- **Copywriter Agent** — Drafts multi-channel campaign assets (blog posts, social threads, ad copy) grounded strictly in the extracted facts.
- **Editor-in-Chief Agent** — Reviews all copy for accuracy, tone, and brand consistency before finalizing output.

### Key Architectural Guarantees

| Feature | Description |
|---|---|
| 🔍 **Ambiguity Detection** | The Researcher Agent aggressively scans the source document for vague or unverifiable marketing language (e.g., "industry leading", "best in class") and extracts it into a structured `ambiguous_statements` field, surfacing it in the UI so the user knows exactly what claims could not be verified. |
| 🔒 **Deterministic Guardrails** | Regex-based checks that flag and block any unverified pricing figures or feature claims not found in the source document. |
| 📊 **Semantic Confidence Scoring** | Each generated asset is scored against the source material to quantify factual fidelity before delivery. |

The system is served through a **premium Next.js dashboard** featuring a "Bitcoin DeFi" aesthetic, a tabbed interface for organized campaign output, and **real-time Server-Sent Events (SSE) streaming** so users can watch the agents reason live.

---

## Tech Stack

- **Programming Languages:** Python, TypeScript, HTML/CSS
- **Frameworks:** Next.js 15 (React 19), FastAPI, LangGraph, Tailwind CSS v4
- **Databases:** Stateless (In-memory state machine for MVP)
- **APIs & Third-Party Tools:** Groq API (Llama 3.3 70B-Versatile), BeautifulSoup4 (Web Scraping), Vercel (Frontend Hosting), Render (Backend Hosting)

---

## Setup Instructions

### Backend Setup

```bash
# 1. Navigate to the backend directory
cd backend

# 2. Create and activate a virtual environment
python -m venv venv

# Windows
.\venv\Scripts\activate

# Mac / Linux
source venv/bin/activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Configure environment variables
# Create a .env file in the /backend directory and add:
# GROQ_API_KEY="your_api_key_here"

# 5. Start the backend server
uvicorn main:app --reload --port 8000
```

### Frontend Setup

```bash
# 1. Open a new terminal and navigate to the frontend directory
cd frontend

# 2. Install dependencies
npm install

# 3. Start the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser to access the UI.
