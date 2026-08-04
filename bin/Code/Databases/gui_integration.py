"""PySide6 GUI integration layer for the LucasChess R6 analytics subsystem.

This module bridges the Phase 5 analytics backend with the Qt widget
layer. It exposes three public building blocks:

* :func:`show_readiness_dialog` -- renders a database-readiness summary
  in a modal dialog, giving the user a proceed/cancel decision point
  before a potentially expensive mass-analysis run.
* :func:`create_mass_analysis_policy_widget` -- a self-contained policy
  group box letting the user decide whether Tier 3 ("Gold Standard")
  games are skipped or re-analyzed.
* :func:`get_selected_analysis_mode` -- translates the policy checkbox
  state into the backend mode token (``"MISSING_ONLY"`` /
  ``"OVERWRITE"``).
"""

from __future__ import annotations

from typing import Any, Optional

from PySide6 import QtCore, QtGui, QtWidgets

from Code.Databases.analysis_provenance import filter_recnos_for_analysis
from Code.Databases.analytics_engine import AnalyticsEngine
from Code.Databases.phase5_ui_bridge import format_readiness_html, get_tier_badge_info

__all__ = [
    "MODE_MISSING_ONLY",
    "MODE_OVERWRITE",
    "show_readiness_dialog",
    "show_data_fitness_wizard",
    "create_mass_analysis_policy_widget",
    "get_selected_analysis_mode",
    "format_readiness_html",
    "get_tier_badge_info",
    "filter_recnos_for_analysis",
]

#: Analysis-mode token: skip games that already hold Tier 3 analysis data.
MODE_MISSING_ONLY: str = "MISSING_ONLY"

#: Analysis-mode token: re-analyze every game, overwriting existing data.
MODE_OVERWRITE: str = "OVERWRITE"


def show_readiness_dialog(parent: Optional[QtWidgets.QWidget], db_games: Any) -> str:
    """Display the database-readiness summary and ask whether to proceed."""
    summary = AnalyticsEngine.get_database_readiness_summary(db_games)
    html = format_readiness_html(summary)

    dialog = QtWidgets.QMessageBox(parent)
    dialog.setWindowTitle("Data Fitness & Analytics")
    dialog.setIcon(QtWidgets.QMessageBox.Icon.Information)
    dialog.setTextFormat(QtCore.Qt.TextFormat.RichText)
    dialog.setText(html)
    
    btn_clean = dialog.addButton("Data Fitness", QtWidgets.QMessageBox.ButtonRole.ActionRole)
    btn_analytics = dialog.addButton("Generate Analytics", QtWidgets.QMessageBox.ButtonRole.ActionRole)
    btn_cancel = dialog.addButton("Cancel", QtWidgets.QMessageBox.ButtonRole.RejectRole)
    
    dialog.setDefaultButton(btn_clean)
    dialog.setEscapeButton(btn_cancel)
    dialog.setWindowModality(QtCore.Qt.WindowModality.ApplicationModal)
    dialog.setTextInteractionFlags(QtCore.Qt.TextInteractionFlag.TextBrowserInteraction)
    dialog.setStyleSheet("QLabel { min-width: 480px; }")

    dialog.exec()
    
    if dialog.clickedButton() == btn_clean:
        return "MASS_ANALYSIS"
    elif dialog.clickedButton() == btn_analytics:
        return "ANALYTICS"
    return "CANCEL"



def show_data_fitness_wizard(parent: Optional[QtWidgets.QWidget], total_count: int = 0, is_filtered: bool = False) -> Optional[dict]:
    """Shows the comprehensive Data Fitness & Adjudication Wizard."""
    dialog = QtWidgets.QDialog(parent)
    dialog.setWindowTitle("Data Fitness & Adjudication Wizard")
    dialog.setMinimumWidth(560)
    layout = QtWidgets.QVBoxLayout(dialog)

    scope_str = "Filtered View" if is_filtered else "Entire Database"
    lbl_scope = QtWidgets.QLabel(f"<b>Data Fitness Scope:</b> {scope_str} ({total_count} games)")
    layout.addWidget(lbl_scope)

    # Group 1: Target Mode
    gb_target = QtWidgets.QGroupBox("Target Mode", dialog)
    ly_target = QtWidgets.QVBoxLayout(gb_target)
    rb_missing = QtWidgets.QRadioButton("Target games with missing results ('*') only", gb_target)
    rb_overwrite = QtWidgets.QRadioButton("Redo / Overwrite ALL game results in current view", gb_target)
    rb_missing.setChecked(True)
    ly_target.addWidget(rb_missing)
    ly_target.addWidget(rb_overwrite)
    layout.addWidget(gb_target)

    # Group 2: Primary Policy
    gb_policy = QtWidgets.QGroupBox("Primary Adjudication Policy", dialog)
    ly_policy = QtWidgets.QVBoxLayout(gb_policy)
    bg_policy = QtWidgets.QButtonGroup(dialog)

    rb1 = QtWidgets.QRadioButton("1. Extract from [Termination] PGN Tag")
    rb2 = QtWidgets.QRadioButton("2. Highest Move Accuracy / Lowest ACPL Matchup")
    rb3 = QtWidgets.QRadioButton("3. Time Forfeit / Last Move Turn")
    rb4 = QtWidgets.QRadioButton("4. Live Stockfish Engine Evaluation (Final Position)")

    rb1.setChecked(True)
    bg_policy.addButton(rb1, 1)
    bg_policy.addButton(rb2, 2)
    bg_policy.addButton(rb3, 3)
    bg_policy.addButton(rb4, 4)

    ly_policy.addWidget(rb1)
    ly_policy.addWidget(rb2)
    ly_policy.addWidget(rb3)
    ly_policy.addWidget(rb4)
    layout.addWidget(gb_policy)

    # Group 3: Secondary Fallback
    gb_fallback = QtWidgets.QGroupBox("Secondary Fallback Policy (if primary fails)", dialog)
    ly_fallback = QtWidgets.QVBoxLayout(gb_fallback)
    cb_fallback_type = QtWidgets.QComboBox(gb_fallback)
    cb_fallback_type.addItem("Live Stockfish Engine Evaluation (runs Stockfish analysis)", "STOCKFISH")
    cb_fallback_type.addItem("Embedded PGN Evaluation Comments ([%eval])", "EMBEDDED_EVAL")
    cb_fallback_type.addItem("Turn-based Last Move (1-0 if White moved last, 0-1 if Black)", "LAST_MOVE")
    cb_fallback_type.addItem("None (Leave un-adjudicated)", "NONE")
    cb_fallback_type.setCurrentIndex(0)
    ly_fallback.addWidget(cb_fallback_type)
    layout.addWidget(gb_fallback)

    def on_policy_toggled():
        gb_fallback.setEnabled(not rb4.isChecked())
    bg_policy.buttonToggled.connect(on_policy_toggled)

    btn_box = QtWidgets.QDialogButtonBox(QtWidgets.QDialogButtonBox.StandardButton.Ok | QtWidgets.QDialogButtonBox.StandardButton.Cancel)
    btn_box.accepted.connect(dialog.accept)
    btn_box.rejected.connect(dialog.reject)
    layout.addWidget(btn_box)

    if dialog.exec() == QtWidgets.QDialog.DialogCode.Accepted:
        if rb_overwrite.isChecked():
            msg = (
                "⚠️ WARNING: You have chosen to REDO / OVERWRITE all game results in the current view.\n\n"
                "Existing results will be updated according to your selected policy.\n\n"
                "Are you sure you want to proceed?"
            )
            if not QtWidgets.QMessageBox.warning(dialog, "Confirm Re-adjudication", msg, QtWidgets.QMessageBox.StandardButton.Yes | QtWidgets.QMessageBox.StandardButton.No) == QtWidgets.QMessageBox.StandardButton.Yes:
                return None

        pol_id = bg_policy.checkedId()
        policy_token = "TERMINATION"
        if pol_id == 2: policy_token = "ACCURACY_ACPL"
        elif pol_id == 3: policy_token = "LAST_MOVE"
        elif pol_id == 4: policy_token = "STOCKFISH"

        return {
            "mode": "OVERWRITE" if rb_overwrite.isChecked() else "MISSING_ONLY",
            "policy": policy_token,
            "fallback_type": cb_fallback_type.currentData() if not rb4.isChecked() else "NONE"
        }
    return None

def create_mass_analysis_policy_widget(
    parent: Optional[QtWidgets.QWidget] = None,
    default_missing_only: bool = True,
) -> tuple[QtWidgets.QGroupBox, QtWidgets.QCheckBox]:
    """Build the "Mass Analysis Policy" group box and its policy checkbox."""
    group_box = QtWidgets.QGroupBox("Mass Analysis Policy", parent)
    group_box.setObjectName("massAnalysisPolicyGroupBox")

    checkbox = QtWidgets.QCheckBox(
        "Analyze Missing Data Only (Skip Tier 3 Gold Standard games)",
        group_box,
    )
    checkbox.setObjectName("massAnalysisMissingOnlyCheckBox")
    checkbox.setChecked(default_missing_only)

    tooltip = (
        "When checked, games that already contain Tier 3 (Gold Standard) "
        "analysis data are skipped during mass analysis, avoiding redundant "
        "engine computation and preserving validated annotations.\n\n"
        "Uncheck to re-analyze every game and overwrite all existing "
        "analysis data (OVERWRITE mode)."
    )
    checkbox.setToolTip(tooltip)
    group_box.setToolTip(tooltip)

    layout = QtWidgets.QVBoxLayout(group_box)
    layout.addWidget(checkbox)

    return group_box, checkbox


def get_selected_analysis_mode(checkbox: QtWidgets.QCheckBox) -> str:
    """Translate the policy checkbox state into an analysis-mode token."""
    return MODE_MISSING_ONLY if checkbox.isChecked() else MODE_OVERWRITE
