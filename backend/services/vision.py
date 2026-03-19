import base64
from groq import Groq
from backend.core.config import settings

class VisionService:
    def __init__(self):
        self.client = Groq(api_key=settings.GROQ_API_KEY)
        self.model = settings.GROQ_VISION_MODEL

    async def describe_image(self, image_path: str) -> str:
        """Convert image to base64 and get a technical description from Groq."""
        try:
            with open(image_path, "rb") as image_file:
                encoded_string = base64.b64encode(image_file.read()).decode('utf-8')

            completion = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": "Describe this technical diagram or image from a document in detail for a searchable database. Focus on names of components, flow of data, and specific text visible."},
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:image/jpeg;base64,{encoded_string}",
                                },
                            },
                        ],
                    }
                ],
                temperature=0.1,
                max_tokens=1024,
            )
            return completion.choices[0].message.content
        except Exception as e:
            print(f"Vision analysis failed: {e}")
            return f"Image extraction failed: {str(e)}"

vision_service = VisionService()
