import logging
import uuid
from typing import List, Optional

logger = logging.getLogger(__name__)

class MockObject:
    def __init__(self, **kwargs):
        for k, v in kwargs.items():
            setattr(self, k, v)
        if not hasattr(self, "id"):
            self.id = str(uuid.uuid4())

class ConversationStore:
    def __init__(self):
        pass

    def search_conversations(self, user_id: str, query: Optional[str] = None, limit: int = 20) -> List[any]:
        return []

    def get_turns(self, conversation_id: str) -> List[any]:
        return []

    def get_recent_turns(self, conversation_id: str, count: int = 10) -> List[any]:
        return []

    def get_or_create_conversation(self, *args, **kwargs) -> MockObject:
        conv_id = kwargs.get("conversation_id", kwargs.get("session_id"))
        if not conv_id and args:
            conv_id = args[0]
        return MockObject(id=conv_id or str(uuid.uuid4()))

    def update_title(self, conversation_id: str, title: str) -> None:
        pass

    def update_conversation_summary(self, conversation_id: str, summary: str) -> None:
        pass

    def add_turn(self, **kwargs) -> MockObject:
        return MockObject()

    def add_entity(self, **kwargs) -> None:
        pass

conversation_store = ConversationStore()
