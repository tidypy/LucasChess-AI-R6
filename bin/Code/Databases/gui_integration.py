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



def show_data_fitness_wizard(parent: Optional[QtWidgets.QWidget], missing_count: int = 0) -> Optional[dict]:
    """Shows the missing results adjudication wizard."""
    dialog = QtWidgets.QDialog(parent)
    dialog.setWindowTitle("Data Fitness Wizard - Missing Results")
    layout = QtWidgets.QVBoxLayout(dialog)
    
    lbl = QtWidgets.QLabel(f"{missing_count} games with missing results ('*') detected in this filtered subset.\nHow would you like to adjudicate them?")
    layout.addWidget(lbl)
    
    bg = QtWidgets.QButtonGroup(dialog)
    
    rb1 = QtWidgets.QRadioButton("Option 1: Adjudicate via Engine Evaluation (Final Position)")
    rb2 = QtWidgets.QRadioButton("Option 2: Extract from [Termination] PGN Tag (Fallback to Blank)")
    rb3 = QtWidgets.QRadioButton("Option 3: Award based on Time Forfeit / Last Move")
    rb4 = QtWidgets.QRadioButton("Option 4: Award to player with Highest Accuracy / Lowest ACPL")
    
    rb1.setChecked(True)
    
    bg.addButton(rb1, 1)
    bg.addButton(rb2, 2)
    bg.addButton(rb3, 3)
    bg.addButton(rb4, 4)
    
    layout.addWidget(rb1)
    layout.addWidget(rb2)
    layout.addWidget(rb3)
    layout.addWidget(rb4)
    
    chk_fallback = QtWidgets.QCheckBox("Fallback to Engine Evaluation if metadata is missing")
    chk_fallback.setChecked(True)
    chk_fallback.setEnabled(False) # since option 1 is checked by default
    layout.addWidget(chk_fallback)
    
    def on_rb_toggled():
        chk_fallback.setEnabled(not rb1.isChecked())
    bg.buttonToggled.connect(on_rb_toggled)
    
    btn_box = QtWidgets.QDialogButtonBox(QtWidgets.QDialogButtonBox.StandardButton.Ok | QtWidgets.QDialogButtonBox.StandardButton.Cancel)
    btn_box.accepted.connect(dialog.accept)
    btn_box.rejected.connect(dialog.reject)
    layout.addWidget(btn_box)
    
    if dialog.exec() == QtWidgets.QDialog.DialogCode.Accepted:
        policy = "ENGINE_EVAL"
        id = bg.checkedId()
        if id == 2: policy = "TERMINATION"
        elif id == 3: policy = "LAST_MOVE"
        elif id == 4: policy = "ACCURACY_ACPL"
        
        return {
            "policy": policy,
            "fallback_to_eval": chk_fallback.isChecked()
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
