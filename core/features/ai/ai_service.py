import os
import json
import urllib.request
import urllib.error
from typing import Optional, List, Dict, Any

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
CONFIG_PATH = os.path.join(ROOT_DIR, "ai_config.json")
MEMORY_DIR = os.path.join(ROOT_DIR, "AI_Memory")
PROFILE_PATH = os.path.join(MEMORY_DIR, "AI_Player_Profile.md")

PRESET_PERSONAS = [
    {
        "id": "tal",
        "name": "Mikhail Tal",
        "title": "The Magician from Riga",
        "style": "Hyper-aggressive & Sacrificial",
        "aggression": 98,
        "rigidity": 15,
        "precision": 89,
        "avatar": "🔥",
        "system_prompt": (
            "You are Mikhail Tal, the 8th World Chess Champion. You view chess as an imaginative art of dynamic attacking, "
            "initiative, piece sacrifices, and tactical creativity. When explaining positions, focus on piece activity, dynamic combinations, "
            "opening lines toward the enemy king, and bold ideas. Be enthusiastic, inspiring, and sharp."
        )
    },
    {
        "id": "karpov",
        "name": "Anatoly Karpov",
        "title": "The Boa Constrictor",
        "style": "Prophylactic & Positional Mastery",
        "aggression": 35,
        "rigidity": 94,
        "precision": 97,
        "avatar": "🐍",
        "system_prompt": (
            "You are Anatoly Karpov, the 12th World Chess Champion. You value prophylaxis, restricting opponent counterplay, "
            "controlling key outposts, and building solid positional pressure. Explain moves through pawn structure harmony, king safety, and steady incremental advantages."
        )
    },
    {
        "id": "kasparov",
        "name": "Garry Kasparov",
        "title": "The Beast of Baku",
        "style": "Dynamic Energy & Deep Preparation",
        "aggression": 88,
        "rigidity": 45,
        "precision": 96,
        "avatar": "⚡",
        "system_prompt": (
            "You are Garry Kasparov, the 13th World Chess Champion. You approach chess with intense dynamic energy, deep opening preparation, "
            "central control, and sharp tactical initiative. Explain positions with authoritative grandmaster insight and strategic clarity."
        )
    },
    {
        "id": "carlsen",
        "name": "Magnus Carlsen",
        "title": "The Endgame Virtuoso",
        "style": "Universal & Micro-Advantage Grinder",
        "aggression": 65,
        "rigidity": 60,
        "precision": 99,
        "avatar": "👑",
        "system_prompt": (
            "You are Magnus Carlsen, World Chess Champion. You play flexible, universal chess, grinding small advantages "
            "into winning positions. Keep commentary calm, pragmatic, highly accurate, and focused on practical piece coordination."
        )
    },
    {
        "id": "tutor",
        "name": "Club Grandmaster Coach",
        "title": "Pedagogical Master",
        "style": "Balanced & Instructive",
        "aggression": 50,
        "rigidity": 50,
        "precision": 92,
        "avatar": "🎓",
        "system_prompt": (
            "You are a friendly, patient Grandmaster chess coach explaining concepts to club players. "
            "Focus on pedagogical clarity, explaining tactical themes (forks, pins, skewers) and positional rules in plain, encouraging language."
        )
    }
]

class AIService:
    def __init__(self):
        os.makedirs(MEMORY_DIR, exist_ok=True)
        self._ensure_profile_exists()

    def _ensure_profile_exists(self):
        if not os.path.exists(PROFILE_PATH):
            default_content = (
                "# DeepScout AI Player Profile\n\n"
                "## Player Summary & Style\n"
                "- Preferred Openings (White): 1.e4 (Italian / Ruy Lopez)\n"
                "- Preferred Openings (Black): Sicilian Defense / King's Indian\n"
                "- Tactical Strengths: Fast kingside attacks, initiative\n"
                "- Known Blindspots: Tendency to overextend pawns in closed endgames\n\n"
                "## Recent Coaching Notes\n"
                "- Review rook endgames and active defense.\n"
            )
            with open(PROFILE_PATH, "w", encoding="utf-8") as f:
                f.write(default_content)

    def get_config(self) -> Dict[str, Any]:
        if os.path.exists(CONFIG_PATH):
            try:
                with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                pass
        return {
            "backend_type": "lm_studio",  # "lm_studio" or "byok"
            "lm_url": "http://localhost:1234/v1",
            "byok_url": "https://api.openai.com/v1",
            "byok_key": "",
            "model_name": "gpt-4o-mini",
            "verbosity": "concise",  # "concise" or "detailed"
            "active_persona": "tal",
            "temperature": 0.7,
        }

    def save_config(self, config: Dict[str, Any]) -> Dict[str, Any]:
        with open(CONFIG_PATH, "w", encoding="utf-8") as f:
            json.dump(config, f, indent=2)
        return config

    def get_personas(self) -> List[Dict[str, Any]]:
        return PRESET_PERSONAS

    def get_profile(self) -> str:
        self._ensure_profile_exists()
        try:
            with open(PROFILE_PATH, "r", encoding="utf-8") as f:
                return f.read()
        except Exception as e:
            return f"Error reading profile: {e}"

    def update_profile(self, content: str) -> str:
        self._ensure_profile_exists()
        with open(PROFILE_PATH, "w", encoding="utf-8") as f:
            f.write(content)
        return content

    def test_connection(self, backend_type: str, base_url: str, api_key: Optional[str] = None) -> Dict[str, Any]:
        url = base_url.rstrip("/") + "/models"
        headers = {
            "Content-Type": "application/json",
            "User-Agent": "DeepScout-Chess/1.0",
        }
        if api_key and api_key.strip():
            headers["Authorization"] = f"Bearer {api_key.strip()}"
        elif backend_type == "lm_studio":
            headers["Authorization"] = "Bearer lm-studio"

        req = urllib.request.Request(url, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=8) as response:
                if response.status == 200:
                    data = json.loads(response.read().decode("utf-8"))
                    raw_models = data.get("data") or data.get("models") or (data if isinstance(data, list) else [])
                    models = []
                    for m in raw_models:
                        if isinstance(m, dict):
                            model_id = m.get("id") or m.get("key") or m.get("display_name") or m.get("name") or "model"
                            models.append(model_id)
                        elif isinstance(m, str):
                            models.append(m)
                    return {
                        "success": True,
                        "message": f"Connected successfully! Found {len(models)} models.",
                        "models": models[:10],
                    }
                else:
                    return {"success": False, "message": f"HTTP {response.status}", "models": []}
        except urllib.error.HTTPError as e:
            return {"success": False, "message": f"HTTP Error {e.code}: {e.reason}", "models": []}
        except urllib.error.URLError as e:
            return {"success": False, "message": f"Connection failed: {e.reason}", "models": []}
        except Exception as e:
            return {"success": False, "message": str(e), "models": []}

    def generate_commentary(
        self,
        fen: str,
        eval_str: str,
        main_line: str,
        persona_id: Optional[str] = None,
        context_notes: Optional[str] = None,
    ) -> Dict[str, Any]:
        config = self.get_config()
        backend_type = config.get("backend_type", "lm_studio")
        base_url = config.get("byok_url") if backend_type == "byok" else config.get("lm_url", "http://localhost:1234/v1")
        api_key = config.get("byok_key", "") if backend_type == "byok" else "lm-studio"
        model_name = config.get("model_name") or ("gpt-4o-mini" if backend_type == "byok" else "local-model")
        verbosity = config.get("verbosity", "concise")

        # Select Persona
        chosen_pid = persona_id or config.get("active_persona", "tal")
        persona = next((p for p in PRESET_PERSONAS if p["id"] == chosen_pid), PRESET_PERSONAS[0])

        system_prompt = (
            f"{persona['system_prompt']}\n\n"
            "IMPORTANT RULES:\n"
            "1. DO NOT calculate legal moves from scratch or play independently. Trust the provided Stockfish evaluation completely.\n"
            "2. Explain what the position means, why the evaluated move is strong, and what tactical or strategic motif is at play.\n"
        )
        if verbosity == "concise":
            system_prompt += "3. Keep your response to 1-2 punchy, vivid sentences in character."
        else:
            system_prompt += "3. Provide a vivid 2-paragraph masterclass breakdown of the piece dynamics and plans."

        profile_memory = self.get_profile()
        if profile_memory:
            system_prompt += f"\n\nStudent Memory Profile:\n{profile_memory[:1500]}"

        user_content = (
            f"Position FEN: {fen}\n"
            f"Stockfish Evaluation: {eval_str}\n"
            f"Engine Main Line: {main_line}\n"
        )
        if context_notes:
            user_content += f"Game Context: {context_notes}\n"
        user_content += "Give your Grandmaster commentary for this moment."

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content}
        ]

        if base_url.endswith("/api/v1"):
            url = f"{base_url.rstrip('/')}/chat"
        else:
            url = f"{base_url.rstrip('/')}/chat/completions"

        headers = {
            "Content-Type": "application/json",
            "User-Agent": "DeepScout-Chess/1.0",
        }
        if api_key:
            headers["Authorization"] = f"Bearer {api_key.strip()}"

        payload = {
            "model": model_name,
            "messages": messages,
            "temperature": config.get("temperature", 0.7),
            "max_tokens": 400 if verbosity == "detailed" else 150,
        }

        req = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"), headers=headers, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=20) as resp:
                if resp.status == 200:
                    resp_data = json.loads(resp.read().decode("utf-8"))
                    content = ""
                    if "choices" in resp_data and len(resp_data["choices"]) > 0:
                        content = resp_data["choices"][0]["message"]["content"]
                    elif "output" in resp_data:
                        out = resp_data["output"]
                        if isinstance(out, list):
                            content = " ".join([item.get("content", "") for item in out if isinstance(item, dict)])
                        elif isinstance(out, str):
                            content = out
                    return {
                        "success": True,
                        "persona": persona["name"],
                        "avatar": persona["avatar"],
                        "commentary": content.strip(),
                    }
                else:
                    return {"success": False, "commentary": f"HTTP Error {resp.status}"}
        except Exception as e:
            return {
                "success": False,
                "commentary": f"AI Grandmaster request failed: {str(e)}. Please ensure your endpoint is running or check your API key.",
            }
