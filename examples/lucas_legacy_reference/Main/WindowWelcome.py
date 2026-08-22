from PySide6 import QtCore, QtGui, QtWidgets

import Code
from Code.Z import Util
from Code.QT import Iconos, QTDialogs, Controles, Colocacion

class WelcomeTile(QtWidgets.QFrame):
    clicked = QtCore.Signal()

    def __init__(self, title, description, icon_name, bg_gradient, parent=None):
        super().__init__(parent)
        self.setCursor(QtCore.Qt.CursorShape.PointingHandCursor)
        self.setObjectName("WelcomeTile")
        self.setFrameShape(QtWidgets.QFrame.Shape.StyledPanel)
        
        self.bg_gradient = bg_gradient
        self.setStyleSheet(f"""
            QFrame#WelcomeTile {{
                background: {bg_gradient};
                border-radius: 12px;
                border: 1px solid rgba(255, 255, 255, 0.15);
                padding: 16px;
            }}
            QFrame#WelcomeTile:hover {{
                border: 2px solid #3b82f6;
                background: {bg_gradient};
            }}
        """)

        # Icon & Title header
        lb_icon = QtWidgets.QLabel()
        if hasattr(Iconos, icon_name):
            icon = getattr(Iconos, icon_name)()
            lb_icon.setPixmap(icon.pixmap(48, 48))
        
        lb_title = QtWidgets.QLabel(title)
        font_title = QtGui.QFont()
        font_title.setPointSize(14)
        font_title.setBold(True)
        lb_title.setFont(font_title)
        lb_title.setStyleSheet("color: #ffffff;")

        lb_desc = QtWidgets.QLabel(description)
        font_desc = QtGui.QFont()
        font_desc.setPointSize(10)
        lb_desc.setFont(font_desc)
        lb_desc.setWordWrap(True)
        lb_desc.setStyleSheet("color: #cbd5e1;")

        layout = QtWidgets.QVBoxLayout(self)
        
        header_layout = QtWidgets.QHBoxLayout()
        header_layout.addWidget(lb_icon)
        header_layout.addWidget(lb_title, 1)
        
        layout.addLayout(header_layout)
        layout.addWidget(lb_desc)
        layout.addStretch()

    def mousePressEvent(self, event):
        if event.button() == QtCore.Qt.MouseButton.LeftButton:
            self.clicked.emit()
        super().mousePressEvent(event)


class WindowWelcome(QtWidgets.QDialog):
    def __init__(self, procesador):
        super().__init__(procesador.main_window)
        self.procesador = procesador
        self.wparent = procesador.main_window

        self.setWindowTitle(_("LucasChess AI R6 - Welcome"))
        self.resize(850, 540)
        self.setStyleSheet("background-color: #0f172a; color: #f8fafc;")

        main_layout = QtWidgets.QVBoxLayout(self)
        main_layout.setContentsMargins(24, 24, 24, 24)
        main_layout.setSpacing(20)

        # Header
        header = QtWidgets.QLabel(_("LucasChess AI R6 - Main Hub"))
        header_font = QtGui.QFont()
        header_font.setPointSize(20)
        header_font.setBold(True)
        header.setFont(header_font)
        header.setAlignment(QtCore.Qt.AlignmentFlag.AlignCenter)
        header.setStyleSheet("color: #38bdf8; margin-bottom: 8px;")
        main_layout.addWidget(header)

        sub_header = QtWidgets.QLabel(_("Select an action below to get started:"))
        sub_header_font = QtGui.QFont()
        sub_header_font.setPointSize(11)
        sub_header.setFont(sub_header_font)
        sub_header.setAlignment(QtCore.Qt.AlignmentFlag.AlignCenter)
        sub_header.setStyleSheet("color: #94a3b8; margin-bottom: 12px;")
        main_layout.addWidget(sub_header)

        # Grid of 5 tiles
        grid_layout = QtWidgets.QGridLayout()
        grid_layout.setSpacing(16)

        # Tile 1: Databases
        tile_db = WelcomeTile(
            _("Databases"),
            _("Open, manage, and run vectorized analytics on PGN databases."),
            "Databases",
            "qlineargradient(x1:0, y1:0, x2:1, y2:1, stop:0 #1e293b, stop:1 #0f172a)"
        )
        tile_db.clicked.connect(self.action_databases)
        grid_layout.addWidget(tile_db, 0, 0)

        # Tile 2: Spar against Engine
        tile_spar = WelcomeTile(
            _("Spar Against Engine"),
            _("Play interactive training games against custom engines and tutors."),
            "Engine",
            "qlineargradient(x1:0, y1:0, x2:1, y2:1, stop:0 #1e293b, stop:1 #0f172a)"
        )
        tile_spar.clicked.connect(self.action_spar)
        grid_layout.addWidget(tile_spar, 0, 1)

        # Tile 3: Trainings
        tile_train = WelcomeTile(
            _("Trainings & Puzzles"),
            _("Solve tactical challenges, 101 positions, endgames, and training suites."),
            "Puntos0",
            "qlineargradient(x1:0, y1:0, x2:1, y2:1, stop:0 #1e293b, stop:1 #0f172a)"
        )
        tile_train.clicked.connect(self.action_trainings)
        grid_layout.addWidget(tile_train, 0, 2)

        # Tile 4: Book Factory
        tile_books = WelcomeTile(
            _("Book Factory"),
            _("Create, merge, and export Polyglot opening books."),
            "Book",
            "qlineargradient(x1:0, y1:0, x2:1, y2:1, stop:0 #1e293b, stop:1 #0f172a)"
        )
        tile_books.clicked.connect(self.action_books)
        grid_layout.addWidget(tile_books, 1, 0)

        # Tile 5: Engine Tourneys
        tile_tourney = WelcomeTile(
            _("Engine Tourneys"),
            _("Organize and run automated tournaments between AI engines."),
            "Torneos",
            "qlineargradient(x1:0, y1:0, x2:1, y2:1, stop:0 #1e293b, stop:1 #0f172a)"
        )
        tile_tourney.clicked.connect(self.action_tourneys)
        grid_layout.addWidget(tile_tourney, 1, 1)

        main_layout.addLayout(grid_layout)
        main_layout.addStretch()

    def action_databases(self):
        self.accept()
        from Code.QT import QTDialogs
        from Code.Databases import WDatabase, WDB_GUtils
        dbpath = QTDialogs.select_db(self.wparent, Code.configuration, True, True)
        if dbpath == ":n":
            dbpath, path_pgn = WDB_GUtils.new_database(self.wparent, Code.configuration, with_import_pgn=True)
            if not dbpath:
                return
        if dbpath:
            w = WDatabase.WBDatabase(self.wparent, self.procesador, dbpath, False, False)
            w.exec()

    def action_spar(self):
        self.accept()
        import random
        from Code.PlayAgainstEngine import ManagerPlayAgainstEngine, WPlayAgainstEngine
        dic = WPlayAgainstEngine.play_against_engine(self.procesador, _("Play against an engine"))
        if dic:
            side = dic.get("SIDE", "B")
            if side == "R":
                side = "B" if random.randint(1, 2) == 1 else "N"
            dic["ISWHITE"] = side == "B"
            manager = ManagerPlayAgainstEngine.ManagerPlayAgainstEngine(self.procesador)
            manager.start(dic)

    def action_trainings(self):
        self.accept()
        from Code.Main import Presentacion
        Presentacion.ManagerChallenge101(self.procesador)

    def action_books(self):
        self.accept()
        from Code.Books import WFactory
        WFactory.polyglots_factory(self.procesador)

    def action_tourneys(self):
        self.accept()
        from Code.Tournaments import WTournaments
        WTournaments.tournaments(self.wparent)
