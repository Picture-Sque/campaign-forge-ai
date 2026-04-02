import os
from dotenv import load_dotenv
from langchain_google_genai import ChatGoogleGenerativeAI

# Load environment variables
load_dotenv()

# Force mapping just in case LangChain looks for GOOGLE_API_KEY
if "GEMINI_API_KEY" in os.environ:
    os.environ["GOOGLE_API_KEY"] = os.environ["GEMINI_API_KEY"]

try:
    print("Initializing Gemini 3 Flash Preview...")
    llm = ChatGoogleGenerativeAI(model="gemini-3-flash-preview", temperature=0)
    
    print("Sending ping to Google's servers...")
    response = llm.invoke("Hello, world! Respond with 'Connection Successful' if you can read this.")
    
    print("\n--- RESPONSE ---")
    print(response.content)
    print("----------------\n")
except Exception as e:
    print("\n--- ERROR ---")
    print(str(e))
    print("-------------\n")
