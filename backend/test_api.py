import os
from dotenv import load_dotenv
from langchain_groq import ChatGroq

# Load environment variables
load_dotenv()

try:
    print("Initializing Groq Llama 3.3...")
    llm = ChatGroq(model="llama-3.3-70b-versatile", temperature=0)
    
    print("Sending ping to Groq's servers...")
    response = llm.invoke("Hello, world! Respond with 'Connection Successful' if you can read this.")
    
    print("\n--- RESPONSE ---")
    print(response.content)
    print("----------------\n")
except Exception as e:
    print("\n--- ERROR ---")
    print(str(e))
    print("-------------\n")
