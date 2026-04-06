import os
from dotenv import load_dotenv

# Ensure dotenv is loaded before ANY LangChain imports!
load_dotenv()

import re
from typing import TypedDict, Dict, Any
from pydantic import BaseModel, Field
from langchain_groq import ChatGroq
from langgraph.graph import StateGraph, END
from logger import logger

# Set up the LLM (Using Groq Llama 3.3)
llm = ChatGroq(model="llama-3.3-70b-versatile", temperature=0)

# Define the State
class GraphState(TypedDict):
    source_text: str
    fact_sheet: Dict[str, Any]
    drafts: Dict[str, str]
    revision_count: int
    editor_feedback: str
    status: str
    error: str
    confidence_score: int

# Node 1: Researcher Agent Schema
class FactSheet(BaseModel):
    core_features: list[str] = Field(description="Strict list of core capabilities and product features.")
    technical_specs: list[str] = Field(description="Strict list of technical specifications.")
    target_audience: str = Field(description="The primary target audience group for this product.")
    value_proposition: str = Field(description="The main value or benefit of the product.")
    key_benefits: list[str] = Field(description="A list of key benefits or outcomes for users.")
    ambiguous_statements: list[str] = Field(default_factory=list, description="A list of any vague, confusing, subjective, or contradictory statements found in the source text.")

def researcher_agent(state: GraphState) -> Dict[str, Any]:
    """Parses raw technical document into a structured JSON Fact-Sheet.
    
    Args:
        state: Graph state containing source_text and other campaign data
        
    Returns:
        Dictionary with either 'fact_sheet' (on success) or 'error' (on failure)
    """
    try:
        logger.info("Researcher agent starting")
        
        source_text = state.get("source_text", "").strip()
        
        # Validate input
        if not source_text or len(source_text) < 10:
            logger.warning("Insufficient source text for research")
            return {"error": "Insufficient technical data found in source document to generate a campaign."}
        
        logger.debug(f"Processing source text: {len(source_text)} characters")
        
        prompt = (
            "Analyze the following technical document and extract the following structured fields:\n"
            "1. Core Features: A strict list of core capabilities and product features.\n"
            "2. Technical Specs: A strict list of technical specifications (e.g., integrations, performance metrics).\n"
            "3. Target Audience: The primary target audience group for this product.\n"
            "4. Value Proposition: A single concise sentence summarizing the main value or overarching benefit this product delivers to its users.\n"
            "5. Key Benefits: A list of concrete, user-facing benefits or outcomes that this product enables.\n"
            "6. Ambiguous Statements: You must aggressively look for vague, unquantified, or marketing-fluff language "
            "(e.g., 'super fast', 'industry leading', 'best in class', 'revolutionary') and extract them into this list.\n\n"
            f"Source Document:\n{source_text}"
        )
        
        structured_llm = llm.with_structured_output(FactSheet)
        
        logger.debug("Invoking LLM for fact extraction")
        fact_sheet = structured_llm.invoke(prompt)
        
        logger.info("Researcher agent completed successfully")
        logger.debug(f"Extracted {len(fact_sheet.core_features)} core features, {len(fact_sheet.ambiguous_statements)} ambiguous statements")
        
        return {"fact_sheet": fact_sheet.model_dump()}
        
    except Exception as e:
        error_msg = f"Researcher agent failed: {str(e)}"
        logger.error(error_msg, exc_info=True)
        return {"error": error_msg}

# Node 2: Copywriter Agent Schema
class CopywriterDrafts(BaseModel):
    blog: str = Field(description="A 500-word blog post based on facts.")
    social_thread: str = Field(description="A 5-post social media thread.")
    email_teaser: str = Field(description="A short promotional email teaser.")
    justification: str = Field(description="Explain exactly which facts were used and how the value proposition influenced the content.")

def copywriter_agent(state: GraphState) -> Dict[str, Any]:
    """Generates the campaign drafts constrained safely to the extracted Fact-Sheet.
    
    Args:
        state: Graph state containing fact_sheet and editor_feedback
        
    Returns:
        Dictionary with 'drafts' containing blog, social_thread, email_teaser, justification
    """
    try:
        logger.info("Copywriter agent starting")
        
        fact_sheet = state.get("fact_sheet", {})
        editor_feedback = state.get("editor_feedback", "")
        
        # Validate fact-sheet exists
        if not fact_sheet:
            logger.warning("No fact-sheet provided to copywriter")
            return {"error": "No fact-sheet available for copywriting"}
        
        logger.debug(f"Fact-sheet contains {len(fact_sheet.get('core_features', []))} features")
        
        prompt = "You are a Creative Copywriter. Only use the extracted verified facts below to generate the marketing artifacts.\n"
        prompt += "CRITICAL RULE: You must NEVER invent prices, costs, or discounts. Do not use the $ symbol under any circumstances unless a price is explicitly provided in the extracted facts.\n"
        prompt += f"Verified Facts: {fact_sheet}\n"
        
        if editor_feedback:
            logger.debug(f"Applying feedback: {editor_feedback[:100]}...")
            prompt += f"Editor Feedback to address: {editor_feedback}\n"
        
        prompt += (
            "After generating the blog, social thread, and email teaser, you MUST fill in the 'justification' field. "
            "In this field, think step by step: "
            "(1) List the 2-3 most important facts from the Fact Sheet you chose to highlight and explain WHY you chose them. "
            "(2) Explain how the Value Proposition shaped the central theme or angle of your writing. "
            "(3) Describe any creative decisions you made (tone, format, structure) and why they serve the Target Audience.\n"
        )
        
        logger.debug("Invoking LLM for copywriting")
        structured_llm = llm.with_structured_output(CopywriterDrafts)
        drafts = structured_llm.invoke(prompt)
        
        logger.info("Copywriter agent completed successfully")
        logger.debug(f"Generated blog ({len(drafts.blog)} chars), social ({len(drafts.social_thread)} chars), email ({len(drafts.email_teaser)} chars)")
        
        return {"drafts": drafts.model_dump()}
        
    except Exception as e:
        error_msg = f"Copywriter agent failed: {str(e)}"
        logger.error(error_msg, exc_info=True)
        return {"error": error_msg}

# Node 3: Editor-in-Chief Schema
class EditorDecision(BaseModel):
    is_approved: bool = Field(description="Set to true if there are absolutely zero hallucinations AND the confidence score is 70 or above.")
    feedback: str = Field(description="If rejected, describe exactly what unverified feature or price was hallucinated, or which core facts/value proposition were missing.")
    confidence_score: int = Field(description="A confidence score from 0 to 100 indicating how perfectly the drafts align with the extracted facts and value proposition.")

def editor_agent(state: GraphState) -> Dict[str, Any]:
    """Acts as gatekeeper and rigorously checks the drafts against original facts.
    
    Args:
        state: Graph state containing fact_sheet, drafts, and revision_count
        
    Returns:
        Dictionary with 'status', 'editor_feedback', 'confidence_score', 'revision_count'
    """
    try:
        logger.info("Editor agent starting")
        
        fact_sheet = state.get("fact_sheet", {})
        drafts = state.get("drafts", {})
        rev_count = state.get("revision_count", 0)
        
        logger.debug(f"Revision count: {rev_count}")
        
        # 1. Deterministic Guardrail Logic - Check for financial hallucinations
        currency_pattern = re.compile(r"[\$£€]")
        
        # Convert dictionaries to strings for quick scanning
        fact_sheet_str = str(fact_sheet)
        drafts_str = str(drafts)
        
        # 2. If currency symbol in drafts but not in fact_sheet, block it
        currency_in_drafts = bool(currency_pattern.search(drafts_str))
        currency_in_facts = bool(currency_pattern.search(fact_sheet_str))
        
        if currency_in_drafts and not currency_in_facts:
            logger.warning("Deterministic guardrail triggered: Currency symbol found without source")
            return {
                "status": "rejected",
                "editor_feedback": "Deterministic Guardrail Triggered: Financial hallucination detected. You included pricing/currency in the draft that does not exist in the verified facts. Remove it.",
                "revision_count": rev_count + 1
            }
        
        logger.debug("Deterministic guardrails passed")
        
        # 3. LLM-based semantic validation
        prompt = "You are the Editor-in-Chief. Cross-reference the drafts strictly against the verified fact sheet.\n"
        prompt += f"Fact Sheet: {fact_sheet}\n"
        prompt += f"Drafts: {drafts}\n"
        prompt += (
            "\nYour task has two parts:\n"
            "PART 1 - HALLUCINATION CHECK: Reject the draft if there is ANY mention of features, capabilities, or pricing not present in the fact sheet.\n"
            "PART 2 - CONFIDENCE SCORE: Calculate an integer score from 0 to 100 using these strict rules:\n"
            "  - Start at 100.\n"
            "  - Deduct 20 points for each core feature from the fact sheet that is NOT mentioned anywhere in the drafts.\n"
            "  - Deduct 25 points if the Value Proposition is not clearly highlighted or reflected in the drafts' central theme.\n"
            "  - Deduct 10 points for each key benefit from the fact sheet that is completely absent from the drafts.\n"
            "  - Deduct 15 points for any hallucinated fact, capability, or price not in the fact sheet.\n"
            "CRITICAL RULE: If the confidence_score is below 70, you MUST set is_approved to false, even if there are no explicit hallucinations. "
            "A score below 70 means the draft is factually incomplete and fails editorial standards.\n"
        )
        
        logger.debug("Invoking LLM for semantic validation")
        structured_llm = llm.with_structured_output(EditorDecision)
        decision = structured_llm.invoke(prompt)
        
        status = "approved" if decision.is_approved else "rejected"
        
        logger.info(f"Editor decision: {status} (confidence: {decision.confidence_score}%)")
        if not decision.is_approved:
            logger.debug(f"Rejection reason: {decision.feedback[:100]}...")
        
        return {
            "status": status,
            "editor_feedback": decision.feedback,
            "confidence_score": decision.confidence_score,
            "revision_count": rev_count + 1
        }
        
    except Exception as e:
        error_msg = f"Editor agent failed: {str(e)}"
        logger.error(error_msg, exc_info=True)
        return {
            "status": "rejected",
            "editor_feedback": error_msg,
            "confidence_score": 0,
            "revision_count": rev_count + 1
        }

# Edges & Routing Logic
def route_research(state: GraphState) -> str:
    """Routes after researcher agent execution.
    
    Args:
        state: Graph state from researcher agent
        
    Returns:
        Either END (if error) or "copywriter_node" to continue
    """
    if state.get("error"):
        return END
    return "copywriter_node"

def route_editor(state: GraphState) -> str:
    """Routes after editor agent execution.
    
    Args:
        state: Graph state from editor agent
        
    Returns:
        Either END (if approved or max revisions) or "copywriter_node" to retry
    """
    if state.get("error"):
         return END
    
    status = state.get("status", "")
    rev_count = state.get("revision_count", 0)
    
    # Conditional logic preventing infinite loops
    if status == "approved" or rev_count >= 3:
        return END
    return "copywriter_node"

# Compile LangGraph
workflow = StateGraph(GraphState)

workflow.add_node("researcher_node", researcher_agent)
workflow.add_node("copywriter_node", copywriter_agent)
workflow.add_node("editor_node", editor_agent)

workflow.set_entry_point("researcher_node")

# Routing after research
workflow.add_conditional_edges(
    "researcher_node",
    route_research,
    {"copywriter_node": "copywriter_node", END: END}
)

# Standard edge
workflow.add_edge("copywriter_node", "editor_node")

# Routing after editing limit constraint check
workflow.add_conditional_edges(
    "editor_node",
    route_editor,
    {"copywriter_node": "copywriter_node", END: END}
)

workflow_app = workflow.compile()
