from groq import Groq
from app.core.config import settings
from typing import List, AsyncGenerator

import httpx

class GeneratorService:
    def __init__(self):
        # SSL verification often fails in corporate networks with intercepting proxies
        self.client = Groq(
            api_key=settings.GROQ_API_KEY,
            http_client=httpx.Client(verify=False)
        )
        self.model = settings.GROQ_MODEL
        
        self.system_prompt_template = """You are an expert AI assistant dedicated to helping Desktop Support Engineers. Your goal is to provide a single, coherent technical solution using the most relevant SOP from the context. 🛠️💻

CRITICAL RULE: AVOID MIXING DIFFERENT SOPs
1. ANALYZE which document in the context is MOST relevant to the user's question.
2. CHOOSE ONE PRIMARY SOP as your main source.
3. USE ONLY that SOP's steps in your main solution. NEVER mix steps from different documents. 🚫

RESPONSE STRUCTURE:

### 🎯 Understanding the Issue
[Clearly state which SPECIFIC issue you're addressing]

### ⚡ Prerequisites
- [Required tools/access]
- [Backups needed/Permissions required]

### 🔧 Step-by-Step Solution
[Use steps from ONE primary SOP only - in correct sequence]

**Step 1: [Action Name]**
1. [Detailed instruction]
2. [Exact path/command]
3. [Expected outcome]

[Repeat for all steps in the primary SOP]


### 📚 Source
Internal (Company SOPs) or External (Web search)

Context:
{context_chunks}

User Question: {query}

Answer:"""

    async def generate_queries(self, query: str) -> List[str]:
        """Generate 3 variations of the query for multi-query retrieval."""
        messages = [
            {"role": "system", "content": "You are a helpful assistant. Generate 3 different search queries based on the user's question to help find more relevant information in a document database. Return only the queries, one per line, without numbers or bullets."},
            {"role": "user", "content": query}
        ]
        try:
            completion = self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=0.0,
                max_tokens=100,
            )
            content = completion.choices[0].message.content.strip()
            # Clean up and split by line
            queries = [q.strip() for q in content.split('\n') if q.strip()]
            # Add original query to be safe
            if query not in queries:
                queries.append(query)
            return queries[:4] # Original + 3 variations
        except Exception as e:
            print(f"Query generation failed: {e}")
            return [query]

    async def standalorize_query(self, chat_history: List[dict], current_query: str) -> str:
        """
        Rewrite the current query to be standalone based on chat history.
        """
        if not chat_history:
            return current_query

        # Convert history to a text format for the prompt
        history_text = ""
        for msg in chat_history[-6:]: # Last 3 turns
            role = msg.get('role', 'user')
            content = msg.get('content', '')
            history_text += f"{role}: {content}\n"

        prompt = f"""Given the following conversation history and a new follow-up question, rephrase the new question to be a STANDALONE search query that contains all necessary context.
        
        Rules:
        1. If the new question is already standalone (e.g., "How do I reset password?"), return it exactly as is.
        2. If it depends on context (e.g., "What about for mac?", "How do I do that?"), rewrite it (e.g., "How to reset password for Mac").
        3. Do NOT answer the question. ONLY return the rewritten query.
        
        Chat History:
        {history_text}
        
        New Question: {current_query}
        
        Standalone Query:"""

        messages = [
            {"role": "system", "content": "You are a helpful assistant that clarifies search queries."},
            {"role": "user", "content": prompt}
        ]

        try:
            completion = self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=0.0,
                max_tokens=60, # Short rewritten query
            )
            rewritten = completion.choices[0].message.content.strip()
            print(f"Standalorized: '{current_query}' -> '{rewritten}'")
            return rewritten
        except Exception as e:
            print(f"Standalorization failed: {e}")
            return current_query

    async def generate_stream(self, query: str, context_chunks: List[dict]) -> AsyncGenerator[str, None]:
        # 1. SOP Filtering Logic
        user_sop_preference = None
        query_lower = query.lower()
        
        # Check if user mentioned a specific SOP in the query
        for chunk in context_chunks:
            meta = chunk.get('metadata', {})
            # Handle both 'filename' (future) and 'source' (legacy/current) keys
            sop_filename = meta.get('filename') or meta.get('source')
            
            if sop_filename:
                sop_filename_lower = sop_filename.lower()
                # Remove extension and common separators for flexible matching
                sop_name_clean = sop_filename_lower.replace('.pdf', '').replace('_', ' ').replace('-', ' ')
                
                if sop_name_clean in query_lower:
                    user_sop_preference = sop_filename
                    break
        
        if user_sop_preference:
            print(f"User specified SOP detected: {user_sop_preference}. Filtering chunks.")
            context_chunks = [c for c in context_chunks if (c.get('metadata', {}).get('filename') == user_sop_preference or c.get('metadata', {}).get('source') == user_sop_preference)]

        # 2. Sort chunks by page number to maintain logical flow
        # In case some metadata doesn't have 'page', we default to score-based if sorting isn't possible
        try:
            context_chunks.sort(key=lambda x: x.get('metadata', {}).get('page', 0))
        except Exception as e:
            print(f"Warning: Failed to sort chunks by page: {e}")

        # Prepare context string
        context_text = "\n\n".join(
            [f"Chunk {i+1} (Source: {chunk.get('metadata', {}).get('filename') or chunk.get('metadata', {}).get('source') or 'Unknown'}): {chunk['text']}" for i, chunk in enumerate(context_chunks)]
        )
        
        # Better structure for Groq/Llama
        system_instructions = """System instructions: You are an expert AI assistant providing detailed technical solutions for Desktop Support Engineers.
PRIMARY SOURCE RULES:
1. USE ONLY THE INFORMATION PROVIDED IN THE CONTEXT. Do not use your own external knowledge or training data to answer the question. 🚫🧠
2. If the context does not contain the information needed to answer the question, state: "I cannot find the answer to your question in the provided documents."
3. If the context contains Internal Company SOPs (sources: .pdf, .docx, etc.), prioritize them. 
4. If the context contains Web Search results (source: Web Search (Brave)), use them only if internal documentation is missing.
5. ALWAYS cite your source appropriately in the "Source" section at the end.

CRITICAL RULE: AVOID MIXING DIFFERENT PROCEDURES
- Follow ONE primary path for the main solution. DO NOT mix steps from different unrelated documents. 🚫
- DO NOT provide "Alternative Solutions," "Alternative Procedures," or "Other options." Provide ONLY the most relevant solution. 🚫

RESPONSE STRUCTURE:

### 🎯 Understanding the Issue
[Briefly state the specific problem being solved based on the context]

### ⚡ Prerequisites
[List tools, access, or permissions required, if mentioned in the context]

### 🔧 Step-by-Step Solution
[Follow the primary source exactly]

**Step X: [Action Name]**
1. [Specific instruction]
2. [Exact path or command]
3. [Expected outcome]

### 📚 Source
Internal (Company SOPs) or External (Web search)

The Title Rules: 2-3 words, Title Case, no punctuation.
Use emojis throughout to help with readability.
DO NOT add any sections after the "Source" section. 🚫"""
        
        messages = [
            {"role": "system", "content": system_instructions},
            {"role": "user", "content": f"Context:\n{context_text}\n\nUser Question: {query}"}
        ]

        completion = self.client.chat.completions.create(
            model=self.model,
            messages=messages,
            temperature=0.0,
            max_tokens=2048,
            top_p=1.0,
            stream=True,
            stop=None,
        )

        for chunk in completion:
            if chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content

    def generate_title(self, query: str) -> str:
        prompt = """Create a short, descriptive title for a chat conversation.
Given the user's first message, generate a title that:
1. Is EXACTLY 2-3 words (no more, no less)
2. Captures the main topic or intent
3. Uses title case (capitalize first letter of each word)
4. Contains NO special characters, emojis, or punctuation
5. Is descriptive and searchable

Rules:
- If the question is about a person, use their name (e.g., "Einstein Biography")
- If it's a how-to, start with the action verb (e.g., "Build Chatbot")
- If it's a comparison, use "vs" (e.g., "Python vs JavaScript")
- For data queries, use the subject (e.g., "Sales Analysis")
- Keep it simple and clear

Examples:
User: "How do I build a RAG chatbot with Redis and ChromaDB?"
Title: "Build RAG Chatbot"

User: "What's the difference between React and Vue?"
Title: "React vs Vue"

User: "Explain quantum computing in simple terms"
Title: "Quantum Computing Explained"

Respond with ONLY the title, nothing else."""

        messages = [
            {"role": "system", "content": prompt},
            {"role": "user", "content": f"User message: {query}"}
        ]
        
        try:
            completion = self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=0.0,
                max_tokens=20,
                top_p=1.0,
                stream=False,
                stop=None,
            )
            title = completion.choices[0].message.content.strip()
            # Clean any potential quotes or punctuation just in case
            title = ''.join(e for e in title if e.isalnum() or e.isspace())
            return title
        except Exception as e:
            print(f"Title generation failed: {e}")
            return "New Chat"

    async def check_intent(self, query: str) -> dict:
        """
        Classify the query intent: GREETING, NONSENSE, or TECHNICAL.
        """
        try:
            prompt = f"""Classify the following user message contextually for an IT support chatbot.

Categories:
1. GREETING: Hello, hi, good morning, thanks, bye. (Polite conversational inputs)
2. NONSENSE: Random characters (e.g., 'asdasd', 'acsca'), gibberish, or one-word inputs that are clearly not technical terms.
3. TECHNICAL: A valid tech support question, keyword, or sentence (e.g., 'reset password', 'outlook broken', 'blue screen').

User Message: "{query}"

Return ONLY a JSON object with this format:
{{
    "category": "GREETING" | "NONSENSE" | "TECHNICAL",
    "reply": "..." (only for GREETING or NONSENSE. For TECHNICAL, leave empty string "")
}}

Rules for Reply:
- If GREETING: Be polite and offer help. (e.g., "Hello! How can I assist you with your IT issues today?")
- If NONSENSE: Politely ask for clarification. (e.g., "I'm sorry, I didn't understand that. Could you please provide more details?")
"""
            messages = [
                {"role": "system", "content": "You are a helpful intent classifier. Output JSON only."},
                {"role": "user", "content": prompt}
            ]

            completion = self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=0.0,
                max_tokens=60,
                response_format={"type": "json_object"}
            )
            import json
            content = completion.choices[0].message.content.strip()
            return json.loads(content)
        except Exception as e:
            print(f"Intent check failed: {e}")
            # Fallback to TECHNICAL if classification fails
            return {"category": "TECHNICAL", "reply": ""}

generator = GeneratorService()
