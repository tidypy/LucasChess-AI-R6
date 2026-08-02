from PySide6 import QtWidgets, QtCore
import Code
from Code.QT import LCDialog, Controles, Colocacion, Iconos, QTMessages
from Code.AI.Adapters import OpenAICompatibleAdapter, AsyncChatWorker
from Code.AI.AIMemory import AIMemoryManager
from Code.AI.AILogger import AILogger


class CommentaryDialog(LCDialog.LCDialog):
    """
    Non-blocking dialog displaying AI commentary for a position or Tutor alert.
    """
    def __init__(self, parent, title: str, move_info: str):
        icono = Iconos.AIChip()
        extparam = "ai_commentary"
        super().__init__(parent, title, icono, extparam)

        self.lb_title = Controles.LB(self, f"<b>{title}</b>").set_font_type(puntos=12, peso=75)
        self.lb_info = Controles.LB(self, move_info).set_wrap()
        
        self.txt_commentary = Controles.EM(self, _("Generating AI Explanation..."), is_html=False).fixed_height(140)
        self.txt_commentary.read_only()

        bt_close = Controles.PB(self, _("Close"), rutina=self.accept, plano=False)
        ly_btns = Colocacion.H().relleno().control(bt_close)

        ly_main = Colocacion.V().control(self.lb_title).espacio(5).control(self.lb_info).espacio(5).control(self.txt_commentary).espacio(10).otro(ly_btns).margen(10)
        self.setLayout(ly_main)

    def set_explanation(self, text: str):
        self.txt_commentary.set_text(text)


class TutorCommentary:
    """
    Pipeline that turns Stockfish evaluations into natural language GM commentary.
    """
    def __init__(self, parent_window):
        self.parent_window = parent_window
        self.config = Code.configuration
        self.memory = AIMemoryManager()
        self.worker = None

    def explain_position_async(self, fen: str, eval_str: str, main_line: str, title: str = "Position Explanation"):
        """
        Asynchronously generates position commentary for Kibitzer or Analysis.
        """
        verbosity = getattr(self.config, "x_ai_verbosity", "concise")
        
        system_prompt = (
            "You are a friendly Grandmaster chess coach explaining engine evaluations to a club player.\n"
            "DO NOT recalculate legal moves or play chess yourself. Rely strictly on the provided Stockfish evaluation.\n"
        )
        if verbosity == "concise":
            system_prompt += "Provide a single, punchy 1-sentence summary focusing on the key tactical or positional idea."
        else:
            system_prompt += "Provide a clear 1-2 paragraph explanation covering the strategic idea, piece activity, and tactical threats."

        active_memory = self.memory.get_active_profile_content()
        if active_memory:
            system_prompt += f"\nPlayer Memory Profile:\n{active_memory}"

        user_prompt = (
            f"Position FEN: {fen}\n"
            f"Stockfish Evaluation: {eval_str}\n"
            f"Engine Main Line: {main_line}\n"
            f"Explain what is happening in this position and what Stockfish's line accomplishes."
        )

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ]

        # Determine backend adapter
        backend = getattr(self.config, "x_ai_backend", "lm_studio")
        if backend == "byok":
            url = getattr(self.config, "x_ai_byok_url", "https://api.openai.com/v1")
            key = getattr(self.config, "x_ai_byok_key", "")
        else:
            url = getattr(self.config, "x_ai_lm_url", "http://localhost:1234/v1")
            key = "lm-studio"

        model_name = getattr(self.config, "x_ai_model_name", None)
        adapter = OpenAICompatibleAdapter(base_url=url, api_key=key, model=model_name)

        AILogger.info(f"Submitting AI explanation prompt for '{title}':\nFEN: {fen}\nEval: {eval_str}\nMain Line: {main_line}")

        dialog_info = f"<b>FEN:</b> {fen}<br><b>Eval:</b> {eval_str}"
        if main_line:
            dialog_info += f"<br><b>Line:</b> {main_line}"

        dialog = CommentaryDialog(self.parent_window, title, dialog_info)
        dialog.show()

        # Run via background QThread
        self.worker = AsyncChatWorker(adapter, messages, temperature=0.7, max_tokens=300)
        
        def on_finished(result: str):
            dialog.set_explanation(result)
            # Append to timestamped archive
            if getattr(self.config, "x_ai_enable_archiving", True):
                self.memory.append_to_archive(title, f"Position: {fen}\nEval: {eval_str}\nMain Line: {main_line}\n\nExplanation:\n{result}")

        def on_error(err: str):
            dialog.set_explanation(f"[Error: {err}]")
            AILogger.error("Commentary worker error", Exception(err))

        self.worker.finished_signal.connect(on_finished)
        self.worker.error_signal.connect(on_error)
        self.worker.start()
