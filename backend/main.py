from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
import json
import re
import os
import requests
from bs4 import BeautifulSoup
from typing import Dict, Any, AsyncGenerator
from workflow import workflow_app
from logger import logger

app = FastAPI(title="CampaignForge API")

# CORS Configuration: Restrict to frontend only (security fix)
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")
ALLOWED_ORIGINS = [FRONTEND_URL]

# Allow both http and https versions for deployed frontend
if "http://" in FRONTEND_URL:
    ALLOWED_ORIGINS.append(FRONTEND_URL.replace("http://", "https://"))
elif "https://" in FRONTEND_URL:
    ALLOWED_ORIGINS.append(FRONTEND_URL.replace("https://", "http://"))

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://campaign-forge-frontend.vercel.app"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def health_check() -> Dict[str, str]:
    """Health check endpoint to verify backend is running.
    
    Returns:
        Dictionary with status and message
        
    Raises:
        HTTPException: If backend is in an unhealthy state
    """
    try:
        logger.info("Health check requested")
        return {"status": "ok", "message": "CampaignForge Backend is running."}
    except Exception as e:
        logger.error(f"Health check failed: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Backend health check failed")

def scrape_url(url: str) -> str:
    """Scrapes readable text from a URL using requests + BeautifulSoup.
    
    Args:
        url: URL to scrape
        
    Returns:
        Extracted text (max 8000 chars) or error message
    """
    try:
        logger.info(f"Scraping URL: {url}")
        
        # Validate URL is not empty
        if not url or not url.strip():
            logger.warning("Empty URL provided")
            return "URL_SCRAPE_ERROR: URL cannot be empty"
        
        # Set timeout and headers for robustness
        headers = {"User-Agent": "Mozilla/5.0 (compatible; CampaignForge/1.0)"}
        resp = requests.get(url, headers=headers, timeout=10)
        resp.raise_for_status()  # Raise error for bad status codes
        
        logger.debug(f"URL response status: {resp.status_code}")
        
        soup = BeautifulSoup(resp.text, "html.parser")
        
        # Remove scripts, styles, nav, footer noise
        for tag in soup(["script", "style", "nav", "footer", "header", "aside"]):
            tag.decompose()
        
        text = soup.get_text(separator="\n")
        
        # Collapse whitespace
        text = re.sub(r'\n{3,}', '\n\n', text).strip()
        
        # Cap at 8k chars to stay within context window
        text = text[:8000]
        
        logger.info(f"Successfully scraped {len(text)} characters from {url}")
        return text
        
    except requests.exceptions.Timeout:
        error_msg = f"URL scraping timeout: {url} (exceeded 10 seconds)"
        logger.warning(error_msg)
        return f"URL_SCRAPE_ERROR: {error_msg}"
        
    except requests.exceptions.HTTPError as e:
        error_msg = f"HTTP error when scraping {url}: {e.response.status_code}"
        logger.warning(error_msg)
        return f"URL_SCRAPE_ERROR: {error_msg}"
        
    except requests.exceptions.ConnectionError as e:
        error_msg = f"Connection error when scraping {url}: {str(e)}"
        logger.warning(error_msg)
        return f"URL_SCRAPE_ERROR: {error_msg}"
        
    except Exception as e:
        error_msg = f"Unexpected error scraping {url}: {str(e)}"
        logger.error(error_msg, exc_info=True)
        return f"URL_SCRAPE_ERROR: {error_msg}"

@app.post("/stream")
async def stream_campaign(payload: Dict[str, str]) -> StreamingResponse:
    """Stream campaign generation with real-time agent updates.
    
    Args:
        payload: Dictionary with optional source_text and source_url
        
    Returns:
        StreamingResponse with SSE stream of agent events
        
    Raises:
        HTTPException: 400 if both source_text and source_url are empty
        HTTPException: 500 if workflow processing fails
    """
    try:
        logger.info("Campaign request received")
        
        source_text = payload.get("source_text", "").strip()
        source_url = payload.get("source_url", "").strip()
        
        # Validate input
        if not source_text and not source_url:
            logger.warning("Campaign request with no input (no text or URL)")
            raise HTTPException(
                status_code=400,
                detail="Please provide either source_text or source_url"
            )
        
        logger.debug(f"Input mode: {'text' if source_text else 'url'}")
        
        # If a URL was provided, scrape it first
        if source_url and not source_text:
            logger.info(f"Scraping URL: {source_url}")
            source_text = scrape_url(source_url)
            
            # Check if scraping failed
            if source_text.startswith("URL_SCRAPE_ERROR"):
                logger.error(f"URL scraping failed: {source_text}")
                raise HTTPException(
                    status_code=400,
                    detail=f"Failed to scrape URL: {source_text}"
                )
        
        initial_state: Dict[str, Any] = {
            "source_text": source_text,
            "fact_sheet": {}, "drafts": {}, "revision_count": 0,
            "editor_feedback": "", "status": "", "error": "", "confidence_score": 0
        }
        
        async def event_generator() -> AsyncGenerator[str, None]:
            """Generate SSE events as agents process the campaign."""
            try:
                logger.info("Starting campaign workflow")
                
                if source_url and not payload.get("source_text"):
                    yield f"data: {json.dumps({'agent': 'System', 'message': f'Scraped {len(source_text)} characters from URL.'})}\n\n"
                
                yield f"data: {json.dumps({'agent': 'System', 'message': 'Booting up LangGraph...'})}\n\n"
                
                # Accumulate the FULL state across all node updates
                cumulative_state: Dict[str, Any] = initial_state.copy()
                
                async for output in workflow_app.astream(initial_state):
                    for node_name, state_update in output.items():
                        try:
                            cumulative_state.update(state_update)
                            
                            if node_name == "researcher_node":
                                if state_update.get("error"):
                                    error_msg = state_update.get('error')
                                    logger.error(f"Researcher error: {error_msg}")
                                    event_data = json.dumps({'agent': 'System', 'message': f'Error: {error_msg}'})
                                    yield f"data: {event_data}\n\n"
                                else:
                                    logger.info("Researcher completed successfully")
                                    event_data = json.dumps({'agent': 'Researcher', 'message': 'Extracting structured facts from raw document...'})
                                    yield f"data: {event_data}\n\n"
                                    
                            elif node_name == "copywriter_node":
                                logger.info("Copywriter processing")
                                yield f"data: {json.dumps({'agent': 'Copywriter', 'message': 'Generating blog, social thread, and email teaser...'})}\n\n"
                                
                            elif node_name == "editor_node":
                                status = state_update.get("status", "approved")
                                if status == "rejected":
                                    logger.warning(f"Draft rejected: {state_update.get('editor_feedback')}")
                                    yield f"data: {json.dumps({'agent': 'Editor', 'message': 'Draft rejected! Routing back for revision...'})}\n\n"
                                else:
                                    logger.info("Draft approved by editor")
                                    yield f"data: {json.dumps({'agent': 'Editor', 'message': 'Drafts approved! Campaign meets deterministic guardrails.'})}\n\n"
                                    
                        except Exception as e:
                            logger.error(f"Error processing node {node_name}: {str(e)}", exc_info=True)
                            yield f"data: {json.dumps({'agent': 'System', 'message': f'Error in {node_name}: {str(e)}'})}\n\n"
                
                logger.info("Campaign workflow completed successfully")
                yield f"data: {json.dumps({'agent': 'System', 'message': 'Done', 'final_state': cumulative_state})}\n\n"
                
            except Exception as e:
                logger.error(f"Error in event generator: {str(e)}", exc_info=True)
                yield f"data: {json.dumps({'agent': 'System', 'message': f'Processing error: {str(e)}'})}\n\n"
        
        return StreamingResponse(event_generator(), media_type="text/event-stream")
        
    except HTTPException:
        # Re-raise HTTP exceptions (already properly formatted)
        raise
    except Exception as e:
        logger.error(f"Unexpected error in stream_campaign: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Campaign processing failed: {str(e)}"
        )
