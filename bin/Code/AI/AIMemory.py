import os
import datetime
from Code.Z import Util
from Code.AI.AILogger import AILogger

MAX_PROFILE_TOKENS_ESTIMATE = 2000  # Approx 8,000 characters
MAX_ARCHIVE_BYTES = 7 * 1024 * 1024  # 7 Megabytes


class AIMemoryManager:
    """
    Manages dual-layer persistent memory:
    1. Active Profile (AI_Player_Profile.md) - Capped at ~2,000 tokens for system prompt injection.
    2. Historical Log Archive (AI_Archive_YYYY-MM-DD_HHMMSS.md) - Timestamped logs rotated at ~7MB.
    """
    def __init__(self):
        self.folder_memory = None
        self.folder_archive = None
        self.profile_path = None
        self.current_archive_path = None
        self._initialized = False

    def _ensure_initialized(self):
        if self._initialized:
            return
        try:
            import Code
            if Code.configuration is None:
                return  # Not ready yet, will try again on next call
            self.folder_memory = Code.configuration.paths.folder_from_userdata("AI_Memory")
            self.folder_archive = Util.opj(self.folder_memory, "Archives")
            Util.create_folder(self.folder_archive)

            self.profile_path = Util.opj(self.folder_memory, "AI_Player_Profile.md")
            self._ensure_profile_exists()
            self._initialized = True
        except Exception as e:
            AILogger.error("Failed to initialize AIMemory paths", e)

    def _ensure_profile_exists(self):
        if not os.path.exists(self.profile_path):
            initial_content = (
                "# Lucas Chess AI Player Profile\n\n"
                "## Player Preferences & Summary\n"
                "- Preferred Openings: [To be learned]\n"
                "- Tactical Blindspots: [To be learned]\n"
                "- Favorite Playstyle: Balanced\n\n"
                "## Recent Analysis Notes\n"
            )
            with open(self.profile_path, "w", encoding="utf-8") as f:
                f.write(initial_content)

    def get_active_profile_content(self) -> str:
        """
        Returns the active profile content for prompt injection.
        Truncates if exceeding ~2,000 token estimate.
        """
        try:
            self._ensure_initialized()
            if not self.profile_path:
                return ""
            self._ensure_profile_exists()
            with open(self.profile_path, "r", encoding="utf-8") as f:
                content = f.read()
            
            # Simple character cap fallback (8000 chars approx 2000 tokens)
            if len(content) > 8000:
                content = content[-8000:]
            return content
        except Exception as e:
            AILogger.error("Error reading active profile", e)
            return ""

    def append_to_archive(self, entry_type: str, text: str):
        """
        Appends an entry to the current timestamped archive file.
        Rotates to a new file if current archive reaches ~7MB.
        """
        try:
            self._ensure_initialized()
            if not self.folder_archive:
                return
            timestamp = datetime.datetime.now().strftime("%Y-%m-%d_%H%M%S")
            
            # Locate or create active timestamped archive
            if not self.current_archive_path or not os.path.exists(self.current_archive_path):
                self._create_new_archive_file(timestamp)

            # Check file size for 7MB rotation limit
            if os.path.getsize(self.current_archive_path) >= MAX_ARCHIVE_BYTES:
                AILogger.info(f"Archive file reached 7MB limit. Rotating archive.")
                self._create_new_archive_file(timestamp)

            log_entry = (
                f"\n--- [{datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] [{entry_type}] ---\n"
                f"{text}\n"
            )

            with open(self.current_archive_path, "a", encoding="utf-8") as f:
                f.write(log_entry)

        except Exception as e:
            AILogger.error("Error appending to memory archive", e)

    def _create_new_archive_file(self, timestamp: str):
        filename = f"AI_Archive_{timestamp}.md"
        self.current_archive_path = Util.opj(self.folder_archive, filename)
        with open(self.current_archive_path, "w", encoding="utf-8") as f:
            f.write(f"# Lucas Chess AI Historical Archive - Created {timestamp}\n\n")
        AILogger.info(f"Created new archive file: {filename}")

    def get_archive_folder_path(self) -> str:
        self._ensure_initialized()
        return self.folder_archive
