from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
import json
import re
import requests
from bs4 import BeautifulSoup
from workflow import workflow_app

app = FastAPI(title="CampaignForge API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def health_check():
    return {"status": "ok", "message": "CampaignForge Backend is running."}

def scrape_url(url: str) -> str:
    """Scrapes readable text from a URL using requests + BeautifulSoup."""
    try:
        headers = {"User-Agent": "Mozilla/5.0 (compatible; CampaignForge/1.0)"}
        resp = requests.get(url, headers=headers, timeout=10)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")
        # Remove scripts, styles, nav, footer noise
        for tag in soup(["script", "style", "nav", "footer", "header", "aside"]):
            tag.decompose()
        text = soup.get_text(separator="\n")
        # Collapse whitespace
        text = re.sub(r'\n{3,}', '\n\n', text).strip()
        return text[:8000]  # Cap at 8k chars to stay within context window
    except Exception as e:
        return f"URL_SCRAPE_ERROR: {str(e)}"

@app.post("/stream")
async def stream_campaign(payload: dict):
    source_text = payload.get("source_text", "")
    source_url  = payload.get("source_url", "")

    # If a URL was provided, scrape it first
    if source_url and not source_text:
        source_text = scrape_url(source_url)

    initial_state = {
        "source_text": source_text,
        "fact_sheet": {}, "drafts": {}, "revision_count": 0,
        "editor_feedback": "", "status": "", "error": "", "confidence_score": 0
    }

    async def event_generator():
        if source_url and not payload.get("source_text"):
            yield f"data: {json.dumps({'agent': 'System', 'message': f'Scraped {len(source_text)} characters from URL.'})}\n\n"

        yield f"data: {json.dumps({'agent': 'System', 'message': 'Booting up LangGraph...'})}\n\n"

        # Accumulate the FULL state across all node updates (fixes missing drafts bug)
        cumulative_state = initial_state.copy()
        async for output in workflow_app.astream(initial_state):
            for node_name, state_update in output.items():
                cumulative_state.update(state_update)
                if node_name == "researcher_node":
                    yield f"data: {json.dumps({'agent': 'Researcher', 'message': 'Extracting structured facts from raw document...'})}\n\n"
                elif node_name == "copywriter_node":
                    yield f"data: {json.dumps({'agent': 'Copywriter', 'message': 'Generating blog, social thread, and email teaser...'})}\n\n"
                elif node_name == "editor_node":
                    status = state_update.get("status", "approved")
                    if status == "rejected":
                        yield f"data: {json.dumps({'agent': 'Editor', 'message': 'Draft rejected! Financial hallucination detected. Routing back for revision.'})}\n\n"
                    else:
                        yield f"data: {json.dumps({'agent': 'Editor', 'message': 'Drafts approved! Campaign meets deterministic guardrails.'})}\n\n"

        yield f"data: {json.dumps({'agent': 'System', 'message': 'Done', 'final_state': cumulative_state})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")
