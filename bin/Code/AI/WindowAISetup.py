import os
from PySide6 import QtCore, QtGui, QtWidgets
import Code
from Code.Z import Util
from Code.QT import Colocacion, Controles, Iconos, LCDialog, QTMessages, QTUtils
from Code.AI.Adapters import OpenAICompatibleAdapter
from Code.AI.AIMemory import AIMemoryManager
from Code.AI.AILogger import AILogger


class WindowAISetup(LCDialog.LCDialog):
    """
    Lucas Chess AI Assistant Setup Dialog (2-Tile Architecture)
    Tile 1: LM Studio (Local LLM Endpoint)
    Tile 2: Cloud API (BYOK - Bring Your Own Key)
    """
    def __init__(self, owner=None):
        titulo = _("Lucas Chess AI Assistant Setup")
        icono = Iconos.Tutor()
        extparam = "window_ai_setup"
        super().__init__(owner, titulo, icono, extparam)

        self.memory_manager = AIMemoryManager()

        # Load saved configuration or set defaults
        self.config = Code.configuration
        self.backend_type = getattr(self.config, "x_ai_backend", "lm_studio")
        self.lm_url = getattr(self.config, "x_ai_lm_url", "http://localhost:1234/v1")
        self.byok_url = getattr(self.config, "x_ai_byok_url", "https://api.openai.com/v1")
        self.byok_key = getattr(self.config, "x_ai_byok_key", "")
        self.verbosity = getattr(self.config, "x_ai_verbosity", "concise")
        self.enable_archiving = getattr(self.config, "x_ai_enable_archiving", True)
        self.model_name = getattr(self.config, "x_ai_model_name", "gpt-4o-mini")

        self.init_ui()

    def init_ui(self):
        # Header / Title Description
        lb_title = Controles.LB(self, _("Configure your AI Assistant Provider")).set_font_type(puntos=13, peso=75)
        lb_desc = Controles.LB(
            self, 
            _("Connect to a local server (LM Studio) or a cloud provider via API Key (BYOK).\n"
              "All processing is standard OpenAI-compatible REST and 100% portable.")
        ).set_wrap()

        # ================= TILE 1: LM STUDIO =================
        ly_lm = Colocacion.V()
        gb_lm = Controles.GB(self, _("Tile 1: Local LLM (LM Studio)"), ly_lm)
        
        lb_lm_desc = Controles.LB(
            gb_lm, 
            _("Recommended Model: Llama-3-8B-Instruct.Q4_K_M.gguf\n"
              "Download & launch LM Studio, start local server at http://localhost:1234")
        ).set_wrap()

        lb_lm_url = Controles.LB(gb_lm, _("Local Endpoint URL:"))
        self.ed_lm_url = Controles.ED(gb_lm, self.lm_url)

        self.bt_test_lm = Controles.PB(gb_lm, _("Test LM Studio Connection"), rutina=self.test_lm_connection)
        self.lb_led_lm = Controles.LB(gb_lm, "🔴 " + _("Disconnected")).align_center()

        ly_lm.control(lb_lm_desc).espacio(5)
        ly_lm.control(lb_lm_url).control(self.ed_lm_url).espacio(5)
        ly_lm.control(self.bt_test_lm).control(self.lb_led_lm)

        # ================= TILE 2: BYOK CLOUD API =================
        ly_byok = Colocacion.V()
        gb_byok = Controles.GB(self, _("Tile 2: Cloud API (BYOK)"), ly_byok)

        lb_byok_desc = Controles.LB(
            gb_byok,
            _("Use your own API key for OpenAI, Anthropic, DeepSeek, or OpenRouter.\n"
              "Keys are stored locally in your configuration.")
        ).set_wrap()

        lb_byok_url = Controles.LB(gb_byok, _("API Base Endpoint URL:"))
        self.ed_byok_url = Controles.ED(gb_byok, self.byok_url)

        lb_byok_key = Controles.LB(gb_byok, _("API Key:"))
        self.ed_byok_key = Controles.ED(gb_byok, self.byok_key)
        self.ed_byok_key.setEchoMode(QtWidgets.QLineEdit.EchoMode.Password)

        lb_byok_model = Controles.LB(gb_byok, _("Model Name (Optional):"))
        self.ed_byok_model = Controles.ED(gb_byok, self.model_name)

        self.bt_test_byok = Controles.PB(gb_byok, _("Test Cloud Connection"), rutina=self.test_byok_connection)
        self.lb_led_byok = Controles.LB(gb_byok, "🔴 " + _("Disconnected")).align_center()

        ly_byok.control(lb_byok_desc).espacio(5)
        ly_byok.control(lb_byok_url).control(self.ed_byok_url).espacio(5)
        ly_byok.control(lb_byok_key).control(self.ed_byok_key).espacio(5)
        ly_byok.control(lb_byok_model).control(self.ed_byok_model).espacio(5)
        ly_byok.control(self.bt_test_byok).control(self.lb_led_byok)

        # Active Backend Choice (Radio buttons)
        self.rb_lm = QtWidgets.QRadioButton(_("Use LM Studio (Local)"))
        self.rb_byok = QtWidgets.QRadioButton(_("Use Cloud API (BYOK)"))
        if self.backend_type == "byok":
            self.rb_byok.setChecked(True)
        else:
            self.rb_lm.setChecked(True)

        ly_tiles = Colocacion.H().control(gb_lm).control(gb_byok)
        ly_radio = Colocacion.H().control(self.rb_lm).control(self.rb_byok).relleno()

        # ================= GLOBAL SETTINGS & DIAGNOSTICS =================
        ly_g = Colocacion.V()
        gb_global = Controles.GB(self, _("Global AI Settings & Diagnostics"), ly_g)

        lb_verb = Controles.LB(gb_global, _("Narration Verbosity:"))
        li_verb_options = [
            (_("Concise (1 Sentence summary)"), "concise"),
            (_("Detailed (1-2 Paragraph GM commentary)"), "detailed"),
        ]
        self.cb_verb = Controles.CB(gb_global, li_verb_options, self.verbosity)

        self.chk_archive = QtWidgets.QCheckBox(_("Enable Archive Logging (Rotate timestamped .md at ~7MB)"))
        self.chk_archive.setChecked(self.enable_archiving)

        bt_open_archive = Controles.PB(gb_global, _("Open Archive Folder"), rutina=self.open_archive_folder)
        bt_self_test = Controles.PB(gb_global, _("Run Diagnostic Self-Test"), rutina=self.run_self_test)

        ly_g_verb = Colocacion.H().control(lb_verb).control(self.cb_verb).relleno()
        ly_g.otro(ly_g_verb).espacio(5)
        ly_g.control(self.chk_archive).espacio(5)
        ly_g_btns = Colocacion.H().control(bt_open_archive).control(bt_self_test)
        ly_g.otro(ly_g_btns)

        # ================= DIALOG ACTION BUTTONS =================
        bt_save = Controles.PB(self, _("Save Settings"), rutina=self.save_settings, plano=False)
        bt_cancel = Controles.PB(self, _("Cancel"), rutina=self.reject, plano=False)
        ly_buttons = Colocacion.H().relleno().control(bt_save).control(bt_cancel)

        # Main Layout Assembly
        ly_main = Colocacion.V()
        ly_main.control(lb_title).control(lb_desc).espacio(10)
        ly_main.otro(ly_radio).espacio(5)
        ly_main.otro(ly_tiles).espacio(10)
        ly_main.control(gb_global).espacio(10)
        ly_main.otro(ly_buttons).margen(10)

        self.setLayout(ly_main)

    def test_lm_connection(self):
        url = self.ed_lm_url.text().strip()
        adapter = OpenAICompatibleAdapter(base_url=url, api_key="lm-studio")
        success, msg = adapter.test_connection()
        if success:
            self.lb_led_lm.setText("🟢 " + _("Connected"))
            QTMessages.temporary_message(self, _("LM Studio Connection Successful!"), 3)
        else:
            self.lb_led_lm.setText("🔴 " + _("Disconnected"))
            QTMessages.message_error(self, f"{_('LM Studio Error')}:\n{msg}")

    def test_byok_connection(self):
        url = self.ed_byok_url.text().strip()
        key = self.ed_byok_key.text().strip()
        if not key:
            QTMessages.message_warning(self, _("Please enter an API Key first."))
            return

        adapter = OpenAICompatibleAdapter(base_url=url, api_key=key)
        success, msg = adapter.test_connection()
        if success:
            self.lb_led_byok.setText("🟢 " + _("Connected"))
            QTMessages.temporary_message(self, _("Cloud API Connection Successful!"), 3)
        else:
            self.lb_led_byok.setText("🔴 " + _("Disconnected"))
            QTMessages.message_error(self, f"{_('Cloud API Error')}:\n{msg}")

    def open_archive_folder(self):
        path = self.memory_manager.get_archive_folder_path()
        if path and os.path.exists(path):
            QtGui.QDesktopServices.openUrl(QtCore.QUrl.fromLocalFile(path))
        else:
            QTMessages.message_information(self, _("Archive folder not yet created."))

    def run_self_test(self):
        AILogger.info("Running AI Diagnostic Self-Test from UI...")
        selected_url = self.ed_lm_url.text() if self.rb_lm.isChecked() else self.ed_byok_url.text()
        selected_key = "lm-studio" if self.rb_lm.isChecked() else self.ed_byok_key.text()
        
        adapter = OpenAICompatibleAdapter(base_url=selected_url, api_key=selected_key)
        success, msg = adapter.test_connection()

        log_path = AILogger.get_instance().log_file_path
        status = "PASSED" if success else "FAILED"
        QTMessages.message_information(
            self,
            f"{_('Diagnostic Self-Test')} {status}:\n\n"
            f"Endpoint: {selected_url}\n"
            f"Result: {msg}\n\n"
            f"{_('Detailed log file')}:\n{log_path}"
        )

    def save_settings(self):
        self.config.x_ai_backend = "byok" if self.rb_byok.isChecked() else "lm_studio"
        self.config.x_ai_lm_url = self.ed_lm_url.text().strip()
        self.config.x_ai_byok_url = self.ed_byok_url.text().strip()
        self.config.x_ai_byok_key = self.ed_byok_key.text().strip()
        self.config.x_ai_model_name = self.ed_byok_model.text().strip()
        self.config.x_ai_verbosity = self.cb_verb.valor()
        self.config.x_ai_enable_archiving = self.chk_archive.isChecked()

        self.config.graba()
        AILogger.info("Saved AI settings to configuration.")
        QTMessages.temporary_message(self, _("AI Settings Saved!"), 2)
        self.accept()
