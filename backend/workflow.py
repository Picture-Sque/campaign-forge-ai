import os
from dotenv import load_dotenv

# Ensure dotenv is loaded before ANY LangChain imports!
load_dotenv()

import re
from typing import TypedDict, Dict, Any
from pydantic import BaseModel, Field
from langchain_groq import ChatGroq
from langgraph.graph import StateGraph, END

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

# Node 1: Researcher Agent Schema
class FactSheet(BaseModel):
    core_features: list[str] = Field(description="Strict list of core capabilities and product features.")
    technical_specs: list[str] = Field(description="Strict list of technical specifications.")
    target_audience: str = Field(description="The primary target audience group for this product.")
    ambiguous_statements: list[str] = Field(default_factory=list, description="A list of any vague, confusing, subjective, or contradictory statements found in the source text.")

def researcher_agent(state: GraphState):
    """Parses raw technical document into a structured JSON Fact-Sheet."""
    print("--- RESEARCHER AGENT ---")
    print("1. Starting Researcher")
    source_text = state.get("source_text", "")
    
    # Graceful Handling for unexpected or thin data
    if not source_text or len(source_text.strip()) < 10:
        return {"error": "Insufficient technical data found in source document to generate a campaign."}
        
    prompt = (
        "Analyze the following technical document and extract the core features, technical specs, and target audience.\n"
        "CRITICAL: You must aggressively look for ambiguous, vague, or unquantified marketing fluff in the source text "
        "(e.g., 'super fast', 'industry leading', 'best in class', 'revolutionary') and extract them into the ambiguous_statements list.\n\n"
        f"{source_text}"
    )
    structured_llm = llm.with_structured_output(FactSheet)
    
    try:
        print("2. Calling LLM")
        fact_sheet = structured_llm.invoke(prompt)
        print("3. LLM Success")
        return {"fact_sheet": fact_sheet.model_dump()}
    except Exception as e:
        print(f"4. LLM Error: {str(e)}")
        return {"error": f"Failed extraction: {str(e)}"}

# Node 2: Copywriter Agent Schema
class CopywriterDrafts(BaseModel):
    blog: str = Field(description="A 500-word blog post based on facts.")
    social_thread: str = Field(description="A 5-post social media thread.")
    email_teaser: str = Field(description="A short promotional email teaser.")

def copywriter_agent(state: GraphState):
    """Generates the campaign drafts constrained safely to the extracted Fact-Sheet."""
    print("--- COPYWRITER AGENT ---")
    fact_sheet = state.get("fact_sheet", {})
    editor_feedback = state.get("editor_feedback", "")
    
    prompt = "You are a Creative Copywriter. Only use the extracted verified facts below to generate the marketing artifacts.\n"
    prompt += "CRITICAL RULE: You must NEVER invent prices, costs, or discounts. Do not use the $ symbol under any circumstances unless a price is explicitly provided in the extracted facts.\n"
    prompt += f"Verified Facts: {fact_sheet}\n"
    
    structured_llm = llm.with_structured_output(CopywriterDrafts)
    drafts = structured_llm.invoke(prompt)
    
    return {"drafts": drafts.model_dump()}

# Node 3: Editor-in-Chief Schema
class EditorDecision(BaseModel):
    is_approved: bool = Field(description="Set to true if there are absolutely zero hallucinations.")
    feedback: str = Field(description="If rejected, describe exactly what unverified feature or price was hallucinated.")

def editor_agent(state: GraphState):
    """Acts as gatekeeper and rigorously checks the drafts against original facts."""
    print("--- EDITOR-IN-CHIEF AGENT ---")
    fact_sheet = state.get("fact_sheet", {})
    drafts = state.get("drafts", {})
    rev_count = state.get("revision_count", 0)
    
    # 1. Deterministic Guardrail Logic
    currency_pattern = re.compile(r"[\$£€]")
    
    # Convert dictionaries to strings for quick scanning
    fact_sheet_str = str(fact_sheet)
    drafts_str = str(drafts)
    
    # 2. If currency symbol in drafts but not in fact_sheet bypass LLM
    if currency_pattern.search(drafts_str) and not currency_pattern.search(fact_sheet_str):
        print("-> Deterministic Guardrail Triggered")
        return {
            "status": "rejected",
            "editor_feedback": "Deterministic Guardrail Triggered: Financial hallucination detected. You included pricing/currency in the draft that does not exist in the verified facts. Remove it.",
            "revision_count": rev_count + 1
        }
    
    prompt = "You are the Editor-in-Chief. Cross-reference the drafts strictly against the verified fact sheet.\n"
    prompt += f"Fact Sheet: {fact_sheet}\n"
    prompt += f"Drafts: {drafts}\n"
    prompt += "\nReject the draft if there is ANY mention of features, capabilities, or pricing not present in the fact sheet."
    
    structured_llm = llm.with_structured_output(EditorDecision)
    decision = structured_llm.invoke(prompt)
    
    status = "approved" if decision.is_approved else "rejected"
    
    return {
        "status": status,
        "editor_feedback": decision.feedback,
        "revision_count": rev_count + 1
    }

# Edges & Routing Logic
def route_research(state: GraphState):
    if state.get("error"):
        return END
    return "copywriter_node"

def route_editor(state: GraphState):
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
