import os
import datetime
import sys
import traceback


class AILogger:
    _instance = None

    def __init__(self):
        self.log_file_path = None

    @classmethod
    def get_instance(cls):
        if cls._instance is None:
            cls._instance = AILogger()
        return cls._instance

    def _ensure_log_file(self):
        if self.log_file_path is not None:
            return
        try:
            import Code
            if Code.configuration is not None:
                from Code.Z import Util
                logs_folder = Code.configuration.paths.folder_from_userdata("Logs")
                self.log_file_path = Util.opj(logs_folder, "ai_debug.log")
                return
        except Exception:
            pass
        # Fallback: write next to the executable/script
        base_dir = os.path.dirname(os.path.abspath(sys.argv[0])) if sys.argv else os.getcwd()
        self.log_file_path = os.path.join(base_dir, "ai_debug.log")

    def log(self, level: str, message: str, exc: Exception = None):
        try:
            self._ensure_log_file()

            timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
            log_line = f"[{timestamp}] [{level.upper()}] {message}\n"
            
            if exc:
                log_line += f"Stacktrace:\n{traceback.format_exc()}\n"

            with open(self.log_file_path, "a", encoding="utf-8") as f:
                f.write(log_line)
        except Exception:
            # Silent fallback to prevent logging errors from interrupting Lucas Chess
            pass

    @classmethod
    def info(cls, message: str):
        cls.get_instance().log("INFO", message)

    @classmethod
    def warning(cls, message: str):
        cls.get_instance().log("WARNING", message)

    @classmethod
    def error(cls, message: str, exc: Exception = None):
        cls.get_instance().log("ERROR", message, exc)

