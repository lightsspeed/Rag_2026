import httpx
from typing import List, Dict, Optional
from backend.core.config import settings

class WebSearchService:
    def __init__(self):
        self.api_key = settings.BRAVE_API_KEY
        self.base_url = "https://api.search.brave.com/res/v1/web/search"
        self.headers = {
            "Accept": "application/json",
            "Accept-Encoding": "gzip",
            "X-Subscription-Token": self.api_key if self.api_key else ""
        }

    async def search(self, query: str, count: int = 5) -> List[Dict]:
        if not self.api_key:
            print("Brave API Key not configured. Skipping web search.")
            return []

        params = {
            "q": query,
            "count": count,
            "text_decorations": False,
            "safesearch": "moderate"
        }

        async with httpx.AsyncClient(verify=False) as client:
            try:
                response = await client.get(
                    self.base_url, 
                    headers=self.headers, 
                    params=params,
                    timeout=10.0
                )
                response.raise_for_status()
                data = response.json()
                
                results = []
                web_results = data.get("web", {}).get("results", [])
                
                for res in web_results:
                    results.append({
                        "id": res.get("id", ""),
                        "text": res.get("description", ""),
                        "initial_score": 0.5, # Default medium score for web results
                        "score": 0.5,
                        "metadata": {
                            "title": res.get("title", ""),
                            "url": res.get("url", ""),
                            "source": "Web Search (Brave)",
                            "is_web": True
                        }
                    })
                
                print(f"Brave Search found {len(results)} results for: {query}")
                return results
            except Exception as e:
                print(f"Brave Search failed: {e}")
                return []

web_search_service = WebSearchService()
