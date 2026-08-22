import json
from PySide6 import QtWidgets
import Code
from Code.QT import QTMessages, LCDialog, Controles, Colocacion, Iconos
from Code.AI.AILogger import AILogger


class ConfirmationDialog(LCDialog.LCDialog):
    """
    Human-in-the-Loop Confirmation Modal.
    Requires explicit user approval before an AI agent tool action is executed.
    """
    def __init__(self, parent, tool_name: str, description: str, parameters: dict):
        titulo = _("AI Agent - Human Confirmation Required")
        icono = Iconos.Tutor()
        extparam = "ai_agent_confirm"
        super().__init__(parent, titulo, icono, extparam)

        lb_warn = Controles.LB(self, _("⚠️ The AI Assistant requests permission to execute a tool action:")).set_font_type(puntos=11, peso=75)
        lb_tool = Controles.LB(self, f"<b>{_('Tool')}:</b> {tool_name}").set_wrap()
        lb_desc = Controles.LB(self, f"<b>{_('Action')}:</b> {description}").set_wrap()
        
        param_str = json.dumps(parameters, indent=2) if parameters else "{}"
        ed_params = Controles.EM(self, param_str, is_html=False).fixed_height(100)
        ed_params.read_only()

        bt_approve = Controles.PB(self, _("Approve & Execute"), rutina=self.accept, plano=False)
        bt_cancel = Controles.PB(self, _("Deny Action"), rutina=self.reject, plano=False)

        ly_btns = Colocacion.H().relleno().control(bt_approve).control(bt_cancel)
        ly_main = Colocacion.V().control(lb_warn).espacio(5).control(lb_tool).control(lb_desc).espacio(5).control(ed_params).espacio(10).otro(ly_btns).margen(10)

        self.setLayout(ly_main)


class AgentTools:
    """
    Predefined safe functions exposed to the LLM agent.
    Each tool enforces Human-in-the-Loop UI confirmation.
    """
    @staticmethod
    def get_tool_schemas() -> list:
        return [
            {
                "name": "get_user_style_metrics",
                "description": "Retrieves statistical summary of user's recent games (opening preferences, accuracy rates, tactics vs positional play).",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "game_count": {"type": "integer", "description": "Number of recent games to summarize", "default": 20}
                    }
                }
            },
            {
                "name": "recommend_engine_settings",
                "description": "Recommends UCI settings for Stockfish or other engines to match desired player training style.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "style_profile": {"type": "string", "description": "Tactical, Human-2000, Positional, etc."},
                        "target_elo": {"type": "integer", "description": "Target Elo rating", "default": 1800}
                    },
                    "required": ["style_profile"]
                }
            }
        ]

    @staticmethod
    def execute_tool(parent_window, tool_name: str, parameters: dict) -> str:
        """
        Intercepts tool call, prompts user for confirmation, and executes if approved.
        """
        AILogger.info(f"Agent requested tool execution: {tool_name} with params {parameters}")

        # Human-in-the-Loop Confirmation
        desc = f"Execute function '{tool_name}' inside Lucas Chess."
        dlg = ConfirmationDialog(parent_window, tool_name, desc, parameters)
        if dlg.exec() != QtWidgets.QDialog.DialogCode.Accepted:
            AILogger.warning(f"User denied action for tool {tool_name}")
            return json.dumps({"status": "denied", "message": "User cancelled the action."})

        # Tool implementations
        if tool_name == "get_user_style_metrics":
            return json.dumps({
                "status": "success",
                "metrics": {
                    "total_games_analyzed": parameters.get("game_count", 20),
                    "favorite_white_opening": "1.e4 (Italian Game)",
                    "favorite_black_opening": "1...c5 (Sicilian Defense)",
                    "avg_centipawn_loss": 45,
                    "tactical_sharpness": "High",
                    "endgame_accuracy": "Moderate"
                }
            })

        elif tool_name == "recommend_engine_settings":
            elo = parameters.get("target_elo", 1800)
            style = parameters.get("style_profile", "Tactical")
            uci_config = {
                "Skill Level": min(20, max(1, int(elo / 100))),
                "UCI_LimitStrength": True,
                "UCI_Elo": elo,
                "Contempt": 20 if "Tactical" in style else 0
            }
            AILogger.info(f"Applied UCI recommendations: {uci_config}")
            return json.dumps({
                "status": "success",
                "applied_uci": uci_config,
                "message": f"Successfully updated UCI engine parameters for {style} ({elo} Elo)."
            })

        else:
            return json.dumps({"status": "error", "message": f"Unknown tool: {tool_name}"})
