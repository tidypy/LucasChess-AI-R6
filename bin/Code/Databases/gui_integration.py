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


def show_readiness_dialog(parent: Optional[QtWidgets.QWidget], db_games: Any) -> bool:
    """Display the database-readiness summary and ask whether to proceed."""
    summary = AnalyticsEngine.get_database_readiness_summary(db_games)
    html = format_readiness_html(summary)

    dialog = QtWidgets.QMessageBox(parent)
    dialog.setWindowTitle("Database Readiness")
    dialog.setIcon(QtWidgets.QMessageBox.Icon.Information)
    dialog.setTextFormat(QtCore.Qt.TextFormat.RichText)
    dialog.setText(html)
    dialog.setStandardButtons(
        QtWidgets.QMessageBox.StandardButton.Ok
        | QtWidgets.QMessageBox.StandardButton.Cancel
    )
    dialog.setDefaultButton(QtWidgets.QMessageBox.StandardButton.Ok)
    dialog.setEscapeButton(QtWidgets.QMessageBox.StandardButton.Cancel)
    dialog.setWindowModality(QtCore.Qt.WindowModality.ApplicationModal)
    dialog.setTextInteractionFlags(
        QtCore.Qt.TextInteractionFlag.TextBrowserInteraction
    )
    dialog.setStyleSheet("QLabel { min-width: 480px; }")

    proceed_button = dialog.button(QtWidgets.QMessageBox.StandardButton.Ok)
    if proceed_button is not None:
        proceed_button.setText("Proceed to Analytics")

    return dialog.exec() == QtWidgets.QMessageBox.StandardButton.Ok


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
