import json
from PySide6 import QtCore, QtWidgets

import Code
from Code.AI.Adapters import AsyncChatWorker, OpenAICompatibleAdapter
from Code.AI.AILogger import AILogger
from Code.AI.AIMemory import AIMemoryManager
from Code.QT import Colocacion, Controles, Iconos, LCDialog, QTDialogs, QTMessages


class StatsSummaryDialog(LCDialog.LCDialog):
    """
    Dialog displaying AI-generated performance and statistics narrative summary.
    """

    def __init__(self, owner, title):
        icono = Iconos.AIChip()
        extparam = "aisummary"
        LCDialog.LCDialog.__init__(self, owner, title, icono, extparam)

        self.tb = QTDialogs.LCTB(self)
        self.tb.new(_("Close"), Iconos.MainMenu(), self.accept)

        self.status_label = Controles.LB(self, _("AI Coach is analyzing your performance metrics...")).align_center()
        f = Controles.FontType(puntos=11, peso=75)
        self.status_label.setFont(f)

        self.tb_text = QtWidgets.QTextEdit(self)
        self.tb_text.setReadOnly(True)
        self.tb_text.setPlaceholderText(_("Waiting for AI summary..."))

        font_text = Controles.FontType(puntos=10)
        self.tb_text.setFont(font_text)

        ly = Colocacion.V().control(self.tb).control(self.status_label).control(self.tb_text).margen(5)
        self.setLayout(ly)

        self.restore_video(default_width=650, default_height=500)
        self.worker = None

    def set_loading(self, text):
        self.status_label.setText(text)

    def set_summary_content(self, markdown_text):
        self.status_label.setText(_("Analysis Complete"))
        self.tb_text.setMarkdown(markdown_text)

    def set_error(self, error_text):
        self.status_label.setText(_("Error generating AI summary"))
        self.tb_text.setPlainText(error_text)

    def closeEvent(self, event):
        if self.worker and self.worker.isRunning():
            self.worker.terminate()
        self.save_video()
        event.accept()


class StatsSummaryFormatter:
    """
    Formats ELO ratings, score percentages, color splits, and openings into structured AI prompts.
    """

    @staticmethod
    def format_performance_data(player_name, performance_obj, filter_name=None):
        """
        Formats Performance object data from WDB_Perfomance into structured dict.
        """
        w_results = performance_obj.dic_results.get("W", [])
        b_results = performance_obj.dic_results.get("B", [])
        w_opps = performance_obj.dic_elo_opponents.get("W", [])
        b_opps = performance_obj.dic_elo_opponents.get("B", [])

        tot_w = len(w_results)
        tot_b = len(b_results)
        tot_games = tot_w + tot_b

        w_score = sum(w_results) if tot_w else 0
        b_score = sum(b_results) if tot_b else 0
        tot_score = w_score + b_score

        w_perf = performance_obj.according_method("FIDE", "W") if tot_w else None
        b_perf = performance_obj.according_method("FIDE", "B") if tot_b else None
        tot_perf = performance_obj.according_method("FIDE", "WB") if tot_games else None

        avg_opp_w = sum(w_opps) / tot_w if tot_w else 0
        avg_opp_b = sum(b_opps) / tot_b if tot_b else 0
        avg_opp_tot = (sum(w_opps) + sum(b_opps)) / tot_games if tot_games else 0

        data = {
            "player": player_name or _("All Players"),
            "filter": filter_name,
            "total_games": tot_games,
            "total_score": f"{tot_score}/{tot_games} ({tot_score * 100 / tot_games:.1f}%)" if tot_games else "0%",
            "performance_elo": tot_perf,
            "avg_opponent_elo": int(avg_opp_tot),
            "white_stats": {
                "games": tot_w,
                "score": f"{w_score}/{tot_w} ({w_score * 100 / tot_w:.1f}%)" if tot_w else "N/A",
                "performance_elo": w_perf,
                "avg_opponent_elo": int(avg_opp_w),
            },
            "black_stats": {
                "games": tot_b,
                "score": f"{b_score}/{tot_b} ({b_score * 100 / tot_b:.1f}%)" if tot_b else "N/A",
                "performance_elo": b_perf,
                "avg_opponent_elo": int(avg_opp_b),
            },
        }
        return data

    @staticmethod
    def format_player_data(player_name, player_obj):
        """
        Formats player openings and stats from WDB_Players into structured dict.
        """
        data = {
            "player": player_name,
            "white_openings": [],
            "black_openings": [],
        }

        # Extract white openings
        if hasattr(player_obj, "data") and player_obj.data and len(player_obj.data) > 0:
            for row in player_obj.data[0][:5]:  # Top 5 white openings
                data["white_openings"].append({
                    "opening": row.get("opening", ""),
                    "games": row.get("games", 0),
                    "win_pct": row.get("pwin", 0),
                    "draw_pct": row.get("pdraw", 0),
                    "loss_pct": row.get("plost", 0),
                })
        if hasattr(player_obj, "data") and player_obj.data and len(player_obj.data) > 1:
            for row in player_obj.data[1][:5]:  # Top 5 black openings
                data["black_openings"].append({
                    "opening": row.get("opening", ""),
                    "games": row.get("games", 0),
                    "win_pct": row.get("pwin", 0),
                    "draw_pct": row.get("pdraw", 0),
                    "loss_pct": row.get("plost", 0),
                })

        return data


def generate_stats_summary_async(parent_window, stats_data, title=None):
    """
    Main entry point for generating AI natural-language performance/stats summary.
    Executes HTTP request asynchronously via AsyncChatWorker.
    """
    if title is None:
        title = _("AI Performance Review")

    dialog = StatsSummaryDialog(parent_window, title)
    dialog.show()

    try:
        config = Code.configuration
        if not config:
            dialog.set_error(_("Configuration not loaded."))
            return

        backend = getattr(config, "x_ai_backend", "lm_studio")
        if backend == "byok":
            url = getattr(config, "x_ai_byok_url", "https://api.openai.com/v1")
            api_key = getattr(config, "x_ai_byok_key", "")
            model = getattr(config, "x_ai_model_name", "gpt-4o-mini")
        else:
            url = getattr(config, "x_ai_lm_url", "http://localhost:1234/v1")
            api_key = "local"
            model = getattr(config, "x_ai_model_name", "local-model")

        adapter = OpenAICompatibleAdapter(base_url=url, api_key=api_key, model=model)

        memory_manager = AIMemoryManager()
        active_profile = memory_manager.get_active_profile_content()

        system_prompt = (
            "You are a senior FIDE Grandmaster and insightful chess coach reviewing a player's database performance statistics.\n"
            "Write a concise, encouraging, and highly actionable performance summary (3 to 4 paragraphs).\n\n"
            "Structure your summary into 3 clear sections:\n"
            "1. 📊 **Executive Performance Overview**: Evaluate overall score, Elo performance vs. average opponent strength, and consistency.\n"
            "2. ⚔️ **Color & Opening Dynamics**: Contrast White vs. Black performance, highlight strong lines, and point out color imbalances.\n"
            "3. 🎯 **Key Action Items & Training Focus**: Give 2 concrete, realistic recommendations for improvement.\n\n"
            "Tone: Constructive, analytical, precise, and encouraging."
        )

        if active_profile:
            system_prompt += f"\n\n---\nPLAYER MEMORY PROFILE:\n{active_profile}\n---"

        user_prompt = (
            f"Here are the compiled database performance metrics to analyze:\n\n"
            f"```json\n{json.dumps(stats_data, indent=2, ensure_ascii=False)}\n```\n\n"
            f"Please generate the Grandmaster performance review."
        )

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]

        worker = AsyncChatWorker(adapter, messages, temperature=0.7, max_tokens=600)
        dialog.worker = worker

        def on_finished(response_text):
            dialog.set_summary_content(response_text)
            # Update memory profile asynchronously with key stats insight
            try:
                memory_manager.append_to_archive("STATS_SUMMARY", f"Player: {stats_data.get('player')}\n\n{response_text}")
            except Exception as ex:
                AILogger.error("Failed to append summary to memory archive", ex)

        def on_error(err_msg):
            dialog.set_error(f"{_('Failed to generate summary from AI server')}:\n{err_msg}")

        worker.finished_signal.connect(on_finished)
        worker.error_signal.connect(on_error)
        worker.start()

    except Exception as e:
        AILogger.error("Error setting up stats summary generation", e)
        dialog.set_error(str(e))
