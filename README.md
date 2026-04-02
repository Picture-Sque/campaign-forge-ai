# CampaignForge

**Replacing hours of manual content repurposing with a deterministic agentic workflow.**

CampaignForge is an "Autonomous Content Factory" that ingests raw technical documents and transforms them into multi-channel marketing campaigns (Blogs, Social Threads, and Email Teasers) while strictly enforcing brand tone and factual accuracy. 

Unlike traditional LLM wrappers that hallucinate freely, CampaignForge runs a robust self-correcting feedback loop between a creative Copywriter agent and an Editor-in-Chief gatekeeper, grounded by deterministic fact-extraction.

## Architectural Details

The system relies on a modern decoupled architecture:

- **Frontend UI (Next.js + Tailwind CSS)**: Provides a premium, responsive "Agent Room" dashboard. It streams agent states in real-time using Server-Sent Events (SSE).
- **Backend Orchestration (LangGraph + FastAPI)**: A reactive Python backend containing the cyclic state machine controlling the agent assembly line.
- **LLM Engine (Gemini 1.5 Flash)**: Optimized for deep context windows and heavily constrained through strict Pydantic JSON schemas.

### The Agent Assembly Line
1. **Lead Research Agent**: Ingests raw text into a strict JSON Fact-Sheet.
2. **Creative Copywriter Agent**: Receives the facts and drafts the campaign assets.
3. **Editor-in-Chief Agent**: Validates drafts against the JSON facts using deterministic guardrails and LLM semantic checks. Loops back to the Copywriter if hallucinations are detected (max 3 revisions).

## Quickstart Guide

Follow these steps to run CampaignForge locally.

### 1. Setup the Backend
1. Open a terminal and navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Create and activate a Python virtual environment:
   ```bash
   python -m venv venv
   # On Windows:
   .\venv\Scripts\activate
   # On macOS/Linux:
   source venv/bin/activate
   ```
3. Install the dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Insert your API Key:
   Open the `backend/.env` file and replace the placeholder with your actual Google Gemini API key:
   ```env
   GEMINI_API_KEY="AIzaSy...your-actual-key"
   ```
5. Start the FastAPI server:
   ```bash
   uvicorn main:app --reload --port 8000
   ```
   *(The backend API and LangGraph streaming endpoint are now running at `http://localhost:8000`)*

### 2. Setup the Frontend
1. Open a new, second terminal and navigate to the frontend directory:
   ```bash
   cd frontend
   ```
2. Install the Node.js dependencies:
   ```bash
   npm install
   ```
3. Start the Next.js development server:
   ```bash
   npm run dev
   ```
   *(The agent dashboard resolves at `http://localhost:3000`)*

### 3. Run the Automation
Navigate to **http://localhost:3000** in your browser. Paste any technical document into the left-hand input module and click **Deploy Agents**. Watch as the autonomous workflow extracts facts, generates drafts, applies deterministic guardrails, and renders your final verified campaign!
