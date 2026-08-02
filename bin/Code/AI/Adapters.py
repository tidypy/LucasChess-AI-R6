import json
import urllib.request
import urllib.error
from PySide6 import QtCore
from Code.AI.AILogger import AILogger


class OpenAICompatibleAdapter:
    """
    Universal REST Adapter for OpenAI-compatible completions endpoints (LM Studio, BYOK Cloud APIs).
    Uses 100% standard library urllib.request to ensure portability.
    """
    def __init__(self, base_url: str = "http://localhost:1234/v1", api_key: str = "lm-studio", timeout: int = 15, model: str = None):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key or "lm-studio"
        self.timeout = timeout
        self.model = model or ("gpt-4o-mini" if "localhost" not in self.base_url and "127.0.0.1" not in self.base_url else "local-model")

    def _get_headers(self) -> dict:
        return {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}",
            "User-Agent": "LucasChess/6.0 OpenAIAdapter"
        }

    def test_connection(self) -> tuple[bool, str]:
        """
        Tests connection to /v1/models or /api/v1/models endpoint.
        Returns (success: bool, status_message: str).
        """
        url = f"{self.base_url}/models"
        req = urllib.request.Request(url, headers=self._get_headers())
        try:
            AILogger.info(f"Testing connection to endpoint: {url}")
            with urllib.request.urlopen(req, timeout=5) as response:
                if response.status == 200:
                    data = json.loads(response.read().decode("utf-8"))
                    raw_models = data.get("data") or data.get("models") or (data if isinstance(data, list) else [])
                    models = []
                    for m in raw_models:
                        if isinstance(m, dict):
                            model_id = m.get("id") or m.get("key") or m.get("display_name") or m.get("name") or m.get("path") or "unknown"
                            models.append(model_id)
                        elif isinstance(m, str):
                            models.append(m)
                    model_str = ", ".join(models[:3]) if models else "Connected (No model ID specified)"
                    AILogger.info(f"Endpoint test successful. Found models: {model_str}")
                    return True, f"Connected successfully! Models: {model_str}"
                else:
                    msg = f"HTTP Error {response.status}"
                    AILogger.warning(f"Endpoint test returned: {msg}")
                    return False, msg
        except urllib.error.HTTPError as e:
            msg = f"HTTP Error {e.code}: {e.reason}"
            AILogger.warning(f"Endpoint test failed: {msg}")
            return False, msg
        except urllib.error.URLError as e:
            msg = f"Connection failed: {e.reason}"
            AILogger.warning(f"Endpoint test failed: {msg}")
            return False, msg
        except Exception as e:
            msg = f"Error: {str(e)}"
            AILogger.error("Endpoint test exception", e)
            return False, msg

    def chat_completion(self, messages: list, temperature: float = 0.7, max_tokens: int = 500, model: str = None) -> str:
        """
        Sends a chat completion request to LM Studio v1 REST API (/api/v1/chat) or OpenAI/Anthropic (/v1/chat/completions).
        """
        if self.base_url.endswith("/api/v1"):
            url = f"{self.base_url}/chat"
        else:
            url = f"{self.base_url}/chat/completions"

        payload = {
            "model": model or self.model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens
        }
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(url, data=data, headers=self._get_headers(), method="POST")

        try:
            AILogger.info(f"Sending chat completion to {url}")
            with urllib.request.urlopen(req, timeout=self.timeout) as response:
                if response.status == 200:
                    resp_data = json.loads(response.read().decode("utf-8"))
                    
                    # 1. Standard OpenAI format
                    if "choices" in resp_data and len(resp_data["choices"]) > 0:
                        content = resp_data["choices"][0]["message"]["content"]
                    # 2. LM Studio Native v1 REST API format
                    elif "output" in resp_data:
                        output = resp_data["output"]
                        if isinstance(output, list):
                            texts = []
                            for item in output:
                                if isinstance(item, dict):
                                    texts.append(item.get("content") or item.get("text") or "")
                                elif isinstance(item, str):
                                    texts.append(item)
                            content = "".join(texts)
                        else:
                            content = str(output)
                    # 3. Anthropic format
                    elif "content" in resp_data:
                        cnt = resp_data["content"]
                        if isinstance(cnt, list) and len(cnt) > 0:
                            content = cnt[0].get("text", str(cnt[0]))
                        else:
                            content = str(cnt)
                    else:
                        content = str(resp_data)

                    AILogger.info("Chat completion received successfully.")
                    return content
                else:
                    AILogger.warning(f"Chat completion HTTP status: {response.status}")
                    return f"[Error: HTTP {response.status}]"
        except urllib.error.HTTPError as e:
            err_body = ""
            try:
                err_body = e.read().decode("utf-8")
            except Exception:
                pass
            AILogger.error(f"HTTPError {e.code}: {e.reason} - {err_body}")
            return f"[Error: HTTP {e.code} {e.reason}]"
        except Exception as e:
            AILogger.error("Chat completion error", e)
            return f"[Error connecting to AI endpoint: {str(e)}]"


class AsyncChatWorker(QtCore.QThread):
    """
    QThread worker to run AI requests asynchronously without freezing PySide6 UI.
    """
    finished_signal = QtCore.Signal(str)
    error_signal = QtCore.Signal(str)

    def __init__(self, adapter: OpenAICompatibleAdapter, messages: list, temperature: float = 0.7, max_tokens: int = 500, model: str = None):
        super().__init__()
        self.adapter = adapter
        self.messages = messages
        self.temperature = temperature
        self.max_tokens = max_tokens
        self.model = model

    def run(self):
        try:
            result = self.adapter.chat_completion(self.messages, self.temperature, self.max_tokens, self.model)
            self.finished_signal.emit(result)
        except Exception as e:
            self.error_signal.emit(str(e))

