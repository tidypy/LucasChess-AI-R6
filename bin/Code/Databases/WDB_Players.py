import FasterCode
from PySide6 import QtCore, QtWidgets

import Code
from Code.Base import Game
from Code.Openings import OpeningsStd
from Code.QT import Colocacion, Columnas, Controles, Delegados, FormLayout, Grid, Iconos, QTDialogs, QTMessages

OPENINGS_WHITE, OPENINGS_BLACK, MOVES_WHITE, MOVES_BLACK = range(4)


class ToolbarMoves(QtWidgets.QWidget):
    def __init__(self, side, rutina):
        QtWidgets.QWidget.__init__(self)

        self.dispatch = rutina
        self.side = side
        self.setFont(Controles.FontType())

        ancho = 54

        bt_all = Controles.PB(self, _("All"), self.run_all, plano=False).relative_width(ancho + 16)
        bt_e4 = Controles.PB(self, "e4", self.run_e4, plano=False).relative_width(ancho)
        bt_d4 = Controles.PB(self, "d4", self.run_d4, plano=False).relative_width(ancho)
        bt_c4 = Controles.PB(self, "c4", self.run_c4, plano=False).relative_width(ancho)
        bt_nf3 = Controles.PB(self, "Nf3", self.run_nf3, plano=False).relative_width(ancho)
        bt_other = Controles.PB(self, _("Others"), self.run_other, plano=False).relative_width(ancho + 16)

        ply1 = Controles.PB(self, "^1", self.run_p1, plano=False).relative_width(ancho)
        ply2 = Controles.PB(self, "^2", self.run_p2, plano=False).relative_width(ancho)
        ply3 = Controles.PB(self, "^3", self.run_p3, plano=False).relative_width(ancho)
        ply4 = Controles.PB(self, "^4", self.run_p4, plano=False).relative_width(ancho)
        ply5 = Controles.PB(self, "^5", self.run_p5, plano=False).relative_width(ancho)

        self.sbply = Controles.SB(self, 0, 0, 100)
        self.sbply.capture_changes(self.run_p)
        lbply = Controles.LB(self, _("Half-moves"))

        layout = Colocacion.H().relleno(1).control(bt_all)
        layout.control(bt_e4).control(bt_d4).control(bt_c4).control(bt_nf3).control(bt_other).relleno(1)
        layout.control(ply1).control(ply2).control(ply3).control(ply4).control(ply5)
        layout.control(lbply).control(self.sbply).relleno(1).margen(0)

        self.setLayout(layout)

    def run_all(self):
        self.dispatch(self.side, "all")

    def run_e4(self):
        self.dispatch(self.side, "e2e4")

    def run_d4(self):
        self.dispatch(self.side, "d2d4")

    def run_c4(self):
        self.dispatch(self.side, "c2c4")

    def run_nf3(self):
        self.dispatch(self.side, "g1f3")

    def run_other(self):
        self.dispatch(self.side, "other")

    def run_p1(self):
        self.dispatch(self.side, "p1")

    def run_p2(self):
        self.dispatch(self.side, "p2")

    def run_p3(self):
        self.dispatch(self.side, "p3")

    def run_p4(self):
        self.dispatch(self.side, "p4")

    def run_p5(self):
        self.dispatch(self.side, "p5")

    def run_p(self):
        v = self.sbply.valor()
        self.dispatch(self.side, f"p{v}")


class WPlayer(QtWidgets.QWidget):
    db_games = None
    player: str

    def __init__(self, procesador, wb_database, db_games):
        QtWidgets.QWidget.__init__(self)

        self.wb_database = wb_database
        self.procesador = procesador
        self.data = [[], [], [], []]
        self.movesWhite = []
        self.movesBlack = []
        self.lastFilterMoves = {"white": "", "black": ""}
        self.configuration = Code.configuration
        self.foreground = Code.dic_qcolors["SUMMARY_FOREGROUND"]

        self.infoMove = None  # <-- set_info_move

        self.rebuilding = False

        self.ap = OpeningsStd.ap

        self.gridOpeningWhite = self.gridOpeningBlack = self.gridMovesWhite = self.gridMovesBlack = 0

        # GridOpening
        ancho = 54
        o_columns = Columnas.ListaColumnas()
        o_columns.nueva("opening", _("Opening"), 200)
        o_columns.nueva("games", _("Games"), ancho, align_right=True)
        o_columns.nueva("pgames", f"% {_('Games')}", 70, align_right=True)
        o_columns.nueva("win", _("Win"), ancho, align_right=True)
        o_columns.nueva("draw", _("Draw"), ancho, align_right=True)
        o_columns.nueva("lost", _("Loss"), ancho, align_right=True)
        o_columns.nueva("pwin", f"% {_('Win')}", ancho, align_right=True)
        o_columns.nueva("pdraw", f"% {_('Draw')}", ancho, align_right=True)
        o_columns.nueva("plost", f"% {_('Loss')}", ancho, align_right=True)
        o_columns.nueva("pdrawwin", f"% {_('W+D')}", ancho, align_right=True)
        o_columns.nueva("pdrawlost", f"% {_('L+D')}", ancho, align_right=True)

        self.gridOpeningWhite = Grid.Grid(self, o_columns, complete_row_select=True, xid="OpeningWhite")
        self.gridOpeningBlack = Grid.Grid(self, o_columns, complete_row_select=True, xid="OpeningBlack")

        # GridWhite/GridBlack
        o_columns = Columnas.ListaColumnas()
        o_columns.nueva("games", _("Games"), ancho, align_right=True)
        o_columns.nueva("win", _("Win"), ancho, align_right=True)
        o_columns.nueva("draw", _("Draw"), ancho, align_right=True)
        o_columns.nueva("lost", _("Loss"), ancho, align_right=True)
        o_columns.nueva("pwin", f"% {_('Win')}", ancho, align_right=True)
        o_columns.nueva("pdraw", f"% {_('Draw')}", ancho, align_right=True)
        o_columns.nueva("plost", f"% {_('Loss')}", ancho, align_right=True)

        ancho_col = 40
        with_figurines = self.configuration.x_pgn_withfigurines
        for x in range(1, 50):
            num = (x - 1) * 2
            o_columns.nueva(
                str(num),
                f"{x}.",
                ancho_col,
                align_center=True,
                edicion=Delegados.EtiquetaPOS(with_figurines, with_lines=False),
            )
            o_columns.nueva(
                str(num + 1),
                "...",
                ancho_col,
                align_center=True,
                edicion=Delegados.EtiquetaPOS(with_figurines, with_lines=False),
            )

        self.gridMovesWhite = Grid.Grid(self, o_columns, complete_row_select=True, xid="MovesWhite")
        self.gridMovesWhite.font_type(puntos=self.configuration.x_pgn_fontpoints)
        self.gridMovesBlack = Grid.Grid(self, o_columns, complete_row_select=True, xid="MovesBlack")
        self.gridMovesBlack.font_type(puntos=self.configuration.x_pgn_fontpoints)

        w_white = QtWidgets.QWidget(self)
        tbmovesw = ToolbarMoves("white", self.dispatch_moves)
        ly = Colocacion.V().control(tbmovesw).control(self.gridMovesWhite).margen(3)
        w_white.setLayout(ly)

        wblack = QtWidgets.QWidget(self)
        tbmovesb = ToolbarMoves("black", self.dispatch_moves)
        ly = Colocacion.V().control(tbmovesb).control(self.gridMovesBlack).margen(3)
        wblack.setLayout(ly)

        tabs = Controles.Tab(self)
        tabs.new_tab(self.gridOpeningWhite, _("White openings"))
        tabs.new_tab(self.gridOpeningBlack, _("Black openings"))
        tabs.new_tab(w_white, _("White moves"))
        tabs.new_tab(wblack, _("Black moves"))
        tabs.dispatch_change(self.tab_changed)
        self.tabs = tabs

        # ToolBar
        self.tbWork = QTDialogs.LCTB(self)
        self.tbWork.new(_("Close"), Iconos.MainMenu(), wb_database.tw_terminar)
        self.tbWork.new(_("Select Player"), Iconos.Player32(), self.tw_select_player)
        self.tbWork.new(_("Edit Player & Aliases"), Iconos.ModificarP(), self.tw_edit_aliases)
        self.tbWork.new(_("Reread Players List"), Iconos.Reindexar(), self.tw_reread_players)
        self.tbWork.new(_("Generate / Update Statistics"), Iconos.Estadisticas(), self.tw_rebuild)
        self.tbWork.new(_("AI Summary"), Iconos.AIChip(), self.tw_ai_summary)

        # self.tbWork.setToolButtonStyle(QtCore.Qt.ToolButtonStyle.ToolButtonTextBesideIcon)

        # Search Player Box with autocomplete
        self.ed_search = QtWidgets.QLineEdit(self)
        self.ed_search.setPlaceholderText(_("Begin Typing Name..."))
        self.ed_search.setClearButtonEnabled(True)
        self.ed_search.textChanged.connect(self.on_search_player_changed)

        ly_tb = Colocacion.H().control(self.tbWork).control(Controles.LB(self, f"{_('Search Player')}:")).control(self.ed_search).margen(2)
        layout = Colocacion.V().otro(ly_tb).control(tabs).margen(1)

        self.setLayout(layout)

        self.set_db_games(db_games)
        self.set_player(self.read_variable("PLAYER", ""))
        if not self.player:
            QtCore.QTimer.singleShot(200, self.tw_select_player)

    def tab_changed(self, ntab):
        QtWidgets.QApplication.processEvents()

        if ntab == 0:  # in (0, 2):
            grid = self.gridOpeningWhite
        elif ntab == 1:
            grid = self.gridOpeningBlack
        elif ntab == 2:
            grid = self.gridMovesWhite
        else:
            grid = self.gridMovesBlack
        recno = grid.recno()
        reccount = grid.reccount()
        if reccount:
            self.grid_cambiado_registro(grid, recno, None)

    def actualiza(self):
        if not self.player:
            self.tw_select_player()
            return
        
        has_data = any(len(d) > 0 for d in self.data)
        if not has_data:
            msg = f"{_('No statistics have been generated for')} {self.player} {_('yet.')}\n\n{_('Would you like to generate statistics now?')}"
            if QTMessages.pregunta(self, msg):
                self.tw_rebuild()
                return

        self.tab_changed(self.tabs.current_position())

    def dispatch_moves(self, side, opcion):
        data_side = self.data[MOVES_WHITE if side == "white" else MOVES_BLACK]

        if opcion == "all":
            show_data = range(len(data_side))

        elif opcion in ("e2e4", "d2d4", "c2c4", "g1f3"):
            show_data = [n for n in range(len(data_side)) if data_side[n]["pv"].startswith(opcion)]

        elif opcion == "other":
            show_data = [
                n
                for n in range(len(data_side))
                if not data_side[n]["pv"].startswith("e2e4")
                and not data_side[n]["pv"].startswith("d2d4")
                and not data_side[n]["pv"].startswith("c2c4")
                and not data_side[n]["pv"].startswith("g1f3")
            ]

        else:  # if opcion.startswith("p"):
            num = int(opcion[1:])
            if num == 0:
                return self.dispatch_moves(side, "all")
            if self.lastFilterMoves[side].startswith("p"):
                show_data_previo = range(len(data_side))
            else:
                show_data_previo = self.movesWhite if side == "white" else self.movesBlack
            show_data = [n for n in show_data_previo if data_side[n]["pv"].count(" ") < num]

        if side == "white":
            self.movesWhite = show_data
            self.gridMovesWhite.refresh()

        else:
            self.movesBlack = show_data
            self.gridMovesBlack.refresh()

        self.lastFilterMoves[side] = opcion

        return None

    def set_db_games(self, db_games):
        self.db_games = db_games
        self.set_player(self.read_variable("PLAYER", ""))
        self.update_completer()

    def update_completer(self):
        lp = self.list_of_players()
        if lp and hasattr(self, "ed_search"):
            completer = QtWidgets.QCompleter(lp, self.ed_search)
            completer.setCaseSensitivity(QtCore.Qt.CaseInsensitive)
            completer.setFilterMode(QtCore.Qt.MatchContains)
            completer.activated.connect(self.on_completer_activated)
            self.ed_search.setCompleter(completer)

    def on_completer_activated(self, text):
        if text:
            self.write_variable("PLAYER", text)
            self.set_player(text)
            self.tw_rebuild()

    def on_search_player_changed(self, text):
        query = text.strip()
        lp = self.list_of_players()
        if query and lp:
            for p in lp:
                if p.upper() == query.upper():
                    self.write_variable("PLAYER", p)
                    self.set_player(p)
                    self.tw_rebuild()
                    break

    def set_player(self, player):
        self.player = player
        self.data = [[], [], [], []]
        accion = self.tbWork.li_acciones[1]
        accion.setIconText(self.player if self.player else _("Player"))

        self.gridOpeningWhite.refresh()
        self.gridOpeningBlack.refresh()
        self.gridMovesWhite.refresh()
        self.gridMovesBlack.refresh()
        self.gridOpeningWhite.setFocus()

    def set_info_move(self, info_move):
        self.infoMove = info_move

    def data_grid(self, grid):
        if grid == self.gridOpeningWhite:
            return self.data[OPENINGS_WHITE]
        elif grid == self.gridOpeningBlack:
            return self.data[OPENINGS_BLACK]
        elif grid == self.gridMovesWhite:
            return self.data[MOVES_WHITE]
        elif grid == self.gridMovesBlack:
            return self.data[MOVES_BLACK]
        return None

    def grid_num_datos(self, grid):
        if self.rebuilding:
            return 0
        if grid == self.gridOpeningWhite:
            return len(self.data[OPENINGS_WHITE])
        elif grid == self.gridOpeningBlack:
            return len(self.data[OPENINGS_BLACK])
        elif grid == self.gridMovesWhite:
            return len(self.movesWhite)
        elif grid == self.gridMovesBlack:
            return len(self.movesBlack)
        else:
            return 0

    def grid_dato(self, grid, nfila, ocol):
        if self.rebuilding:
            return ""
        key = ocol.key
        dt = self.data_grid(grid)
        if not dt:
            return ""
        if grid == self.gridMovesWhite:
            if nfila < 0 or nfila >= len(self.movesWhite):
                return ""
            nfila = self.movesWhite[nfila]
        elif grid == self.gridMovesBlack:
            if nfila < 0 or nfila >= len(self.movesBlack):
                return ""
            nfila = self.movesBlack[nfila]
        if nfila < 0 or nfila >= len(dt):
            return ""
        return dt[nfila].get(key, "")

    def grid_cambiado_registro(self, grid, nfila, _ocol):
        dt = self.data_grid(grid)
        if nfila < 0:
            return
        if grid == self.gridMovesWhite:
            nfila = self.movesWhite[nfila]
        elif grid == self.gridMovesBlack:
            nfila = self.movesBlack[nfila]
        if len(dt) > nfila >= 0:
            game = dt[nfila]["game"]
            if game is None:
                pv = dt[nfila]["pv"]
                game = Game.Game()
                game.read_pv(pv)
            if game.pending_opening:
                game.assign_opening()
            if self.infoMove:
                self.infoMove.game_mode(game, len(game) - 1)
            grid.setFocus()

    def grid_color_fondo(self, grid, nfila, ocol):
        dt = self.data_grid(grid)
        if not dt:
            return None
        if grid == self.gridMovesWhite:
            nfila = self.movesWhite[nfila]
        elif grid == self.gridMovesBlack:
            nfila = self.movesBlack[nfila]
        key = f"{ocol.key}c"
        color = dt[nfila].get(key, 99)
        if color == 0:
            return Code.dic_qcolors["SUMMARY_WIN"]
        if color == 2:
            return Code.dic_qcolors["SUMMARY_LOST"]
        return None

    def grid_color_texto(self, grid, nfila, ocol):
        dt = self.data_grid(grid)
        if dt and self.foreground:
            if grid == self.gridMovesWhite:
                nfila = self.movesWhite[nfila]
            elif grid == self.gridMovesBlack:
                nfila = self.movesBlack[nfila]
            key = f"{ocol.key}c"
            color = dt[nfila].get(key)
            if color:
                return self.foreground
        return None

    def grid_tecla_control(self, grid, k, _is_shift, _is_control, _is_alt):
        if k in (QtCore.Qt.Key.Key_Left, QtCore.Qt.Key.Key_Right):
            if self.infoMove:
                self.infoMove.tecla_pulsada(k)
            row, col = grid.current_position_num()
            if k == QtCore.Qt.Key.Key_Right:
                if col > 0:
                    col -= 1
            elif k == QtCore.Qt.Key.Key_Left:
                if col < len(grid.columnas().li_columns) - 1:
                    col += 1
            grid.goto(row, col)
        elif k == QtCore.Qt.Key.Key_Home:
            grid.gotop()
        elif k == QtCore.Qt.Key.Key_End:
            grid.gobottom()
        return True

    def grid_doubleclick_header(self, grid, obj_column):
        if grid == self.gridOpeningWhite:
            data = self.data[OPENINGS_WHITE]
        elif grid == self.gridOpeningBlack:
            data = self.data[OPENINGS_BLACK]
        else:
            return
        key = obj_column.key
        if key == "opening":
            data.sort(
                key=lambda rx: rx['opening'],
                reverse=False,
            )
        elif key == "games":
            data.sort(
                key=lambda rx: f"{99999 - rx['games']:5d}{rx['opening']}",
                reverse=False,
            )
        else:
            return
        grid.refresh()

    def read_variable(self, var, default=None):
        return self.db_games.read_config(var, default)

    def write_variable(self, var, valor):
        self.db_games.save_config(var, valor)

    def list_of_players(self):
        return self.read_variable("LISTA_PLAYERS", [])

    def reread_players(self):
        with QTMessages.one_moment_please(self):
            lista = self.db_games.players()
            self.write_variable("LISTA_PLAYERS", lista)

    def change_player(self, lp):
        li_gen = []
        lista = [(player, player) for player in lp]
        lista.insert(0, ("", ""))
        config = FormLayout.Combobox(_("Name"), lista, extend_seek=True)
        li_gen.append((config, self.read_variable("PLAYER", "")))

        for nalias in range(1, 4):
            li_gen.append(FormLayout.separador)
            config = FormLayout.Combobox(f"{_('Alias')} {nalias}", lista, extend_seek=True)
            li_gen.append((config, self.read_variable(f"ALIAS{nalias}", "")))

        resultado = FormLayout.fedit(
            li_gen,
            title=_("Edit Player & Aliases"),
            parent=self,
            minimum_width=200,
            icon=Iconos.ModificarP(),
        )
        if resultado is None:
            return
        accion, li_gen = resultado
        name, alias1, alias2, alias3 = li_gen
        if not name:
            return
        self.write_variable("PLAYER", name)
        self.write_variable("ALIAS1", alias1)
        self.write_variable("ALIAS2", alias2)
        self.write_variable("ALIAS3", alias3)
        self.set_player(name)
        self.tw_rebuild()

    def test_players_in_db(self):
        if self.db_games.has_field("WHITE") and self.db_games.has_field("BLACK"):
            return True
        QTMessages.message(self, _("This database has no players"))
        return False

    def tw_reread_players(self):
        if not self.test_players_in_db():
            return
        self.reread_players()
        lp = self.list_of_players()
        QTMessages.message_information(self, f"{_('Players list updated')}: {len(lp)} {_('players found')}.")

    def tw_select_player(self):
        if not self.test_players_in_db():
            return
        lp = self.list_of_players()
        if len(lp) == 0:
            self.reread_players()
            lp = self.list_of_players()
            if len(lp) == 0:
                QTMessages.message_information(self, _("No players were found in this database."))
                return

        lista = [(player, player) for player in lp]
        config = FormLayout.Combobox(_("Player"), lista, extend_seek=True)
        resultado = FormLayout.fedit(
            [(config, self.player)],
            title=_("Select Player"),
            parent=self,
            minimum_width=250,
            icon=Iconos.Player32(),
        )
        if resultado:
            _accion, (name,) = resultado
            if name:
                self.write_variable("PLAYER", name)
                self.set_player(name)
                self.tw_rebuild()

    def tw_ai_summary(self):
        if not self.player:
            QTMessages.message_information(self, _("Please select a player first."))
            return
        from Code.AI.StatsSummary import StatsSummaryFormatter, generate_stats_summary_async

        stats_data = StatsSummaryFormatter.format_player_data(self.player, self)
        generate_stats_summary_async(self, stats_data, title=f"{_('AI Player Analysis')}: {self.player}")

    def tw_edit_aliases(self):
        if not self.test_players_in_db():
            return
        lp = self.list_of_players()
        if len(lp) == 0:
            self.reread_players()
            lp = self.list_of_players()
            if len(lp) == 0:
                QTMessages.message_information(self, _("No players were found in this database."))
                return
        self.change_player(lp)

    def tw_rebuild(self):
        if not self.test_players_in_db():
            return
        if not self.player:
            self.tw_select_player()
            if not self.player:
                return
        if not self.db_games.has_field("RESULT"):
            QTMessages.message(self, _("This database does not have a RESULT field"))
            return

        self.rebuilding = True
        pb = QTMessages.ProgressBarWithTime(self, _("Working..."), formato1="%p%")
        pb.mostrar()
        li_fields = ["RESULT", "XPV", "WHITE", "BLACK"]
        dic_openings = {"white": {}, "black": {}}
        dic_moves = {"white": {}, "black": {}}
        dic_hap = {}
        name = self.player
        alias1 = self.read_variable("ALIAS1")
        alias2 = self.read_variable("ALIAS2")
        alias3 = self.read_variable("ALIAS3")
        liplayer = (name, alias1, alias2, alias3)
        liplayer_lower = [p.strip().lower() for p in liplayer if p]

        name_escaped = name.replace("'", "''")
        filtro = f"LOWER(TRIM(WHITE)) = LOWER('{name_escaped}') or LOWER(TRIM(BLACK)) = LOWER('{name_escaped}')"
        for alias in (alias1, alias2, alias3):
            if alias:
                alias_escaped = alias.replace("'", "''")
                filtro += f" or LOWER(TRIM(WHITE)) = LOWER('{alias_escaped}') or LOWER(TRIM(BLACK)) = LOWER('{alias_escaped}')"

        pb.set_total(self.db_games.count_data(filtro))

        for n, alm in enumerate(self.db_games.yield_data(li_fields, filtro)):
            pb.pon(n)
            if pb.is_canceled():
                self.rebuilding = False
                return
            result = (alm.RESULT or "").strip()
            if result in ("1-0", "0-1", "1/2-1/2", "1:0", "0:1", "1/2", "0.5-0.5", "=", "0.5"):
                if result == "1:0":
                    result = "1-0"
                elif result == "0:1":
                    result = "0-1"
                elif result in ("1/2", "0.5-0.5", "=", "0.5"):
                    result = "1/2-1/2"

                white = (alm.WHITE or "").strip()
                black = (alm.BLACK or "").strip()

                resultw = "win" if result == "1-0" else ("lost" if result == "0-1" else "draw")
                resultb = "win" if result == "0-1" else ("lost" if result == "1-0" else "draw")

                if white.lower() in liplayer_lower:
                    side = "white"
                    result = resultw
                elif black.lower() in liplayer_lower:
                    side = "black"
                    result = resultb
                else:
                    continue
                xpv = alm.XPV
                if not xpv:
                    continue
                if "|" in xpv:
                    xpv = xpv.split("|")[-1]
                if not xpv:
                    continue

                # openings
                ap = self.ap.base_xpv(xpv)
                hap = hash(ap)
                dco = dic_openings[side]
                if hap not in dic_hap:
                    dic_hap[hap] = ap
                if hap not in dco:
                    dco[hap] = {"win": 0, "draw": 0, "lost": 0}
                dco[hap][result] += 1

                # moves
                listapvs = FasterCode.xpv_pv(xpv).split(" ")
                dcm = dic_moves[side]
                pvt = ""
                for pv in listapvs:
                    if pvt:
                        pvt = f"{pvt} {pv}"
                    else:
                        pvt = pv
                    if pvt not in dcm:
                        dcm[pvt] = {"win": 0, "draw": 0, "lost": 0, "games": 0}
                    dcm[pvt][result] += 1
                    dcm[pvt]["games"] += 1

        pb.close()

        with QTMessages.one_moment_please(self, _("Working...")):

            def color3(rx, ry, rz):
                if rx > ry and rx > rz:
                    return 0
                if rx < ry and rx < rz:
                    return 2
                return 1

            def color2(rx, ry):
                if rx > ry:
                    return 0
                if rx < ry:
                    return 2
                return 1

            def z(rx):
                return f"{rx:0.2f}"

            color = None
            info = None
            init_indicator = None
            li_nags = []
            is_line = False

            data = [[], [], [], []]
            for side in ("white", "black"):
                dtemp = []
                tt = 0
                for hap in dic_openings[side]:
                    dt = dic_openings[side][hap]
                    win, draw, lost = dt["win"], dt["draw"], dt["lost"]
                    t = win + draw + lost
                    tt += t
                    ap = dic_hap[hap]
                    dic = {
                        "opening": ap.tr_name if (ap and hasattr(ap, "tr_name")) else _("Unknown Opening"),
                        "opening_obj": ap,
                        "games": t,
                        "win": win,
                        "draw": draw,
                        "lost": lost,
                        "pwin": z(win * 100.0 / t),
                        "pdraw": z(draw * 100.0 / t),
                        "plost": z(lost * 100.0 / t),
                        "pdrawlost": z((draw + lost) * 100.0 / t),
                        "pdrawwin": z((win + draw) * 100.0 / t),
                        "winc": color3(win, draw, lost),
                        "pwinc": color3(win, draw, lost),
                        "drawc": color3(draw, win, lost),
                        "pdrawc": color3(draw, win, lost),
                        "lostc": color3(lost, win, draw),
                        "plostc": color3(lost, win, draw),
                        "pdrawlostc": color2(draw + lost, draw + win),
                        "pdrawwinc": color2(draw + win, draw + lost),
                    }
                    p = Game.Game()
                    if ap and hasattr(ap, "a1h8"):
                        p.read_pv(ap.a1h8)
                    dic["game"] = p
                    dtemp.append(dic)

                for draw in dtemp:
                    draw["pgames"] = z(draw["games"] * 100.0 / tt)
                dtemp.sort(
                    key=lambda rx: f"{99999 - rx['games']:5d}{rx['opening']}",
                    reverse=False,
                )
                if side == "white":
                    data[OPENINGS_WHITE] = dtemp
                else:
                    data[OPENINGS_BLACK] = dtemp

                # moves
                dtemp = []
                dc = dic_moves[side]
                st_rem = set()

                listapvs = list(dic_moves[side].keys())
                listapvs.sort()

                sipar = 1 if side == "white" else 0

                for pv in listapvs:
                    if dc[pv]["games"] == 1:
                        lipv = pv.split(" ")
                        nlipv = len(lipv)
                        if nlipv > 1:
                            pvant = " ".join(lipv[:-1])
                            if pvant in st_rem or dc[pvant]["games"] == 1 and nlipv % 2 == sipar:
                                st_rem.add(pv)

                for pv in st_rem:
                    del dc[pv]

                listapvs = list(dic_moves[side].keys())
                listapvs.sort()
                antlipv = []
                for npv, pv in enumerate(listapvs):
                    dt = dic_moves[side][pv]
                    win, draw, lost = dt["win"], dt["draw"], dt["lost"]
                    t = win + draw + lost
                    tt += t
                    lipv = pv.split(" ")
                    nli = len(lipv)
                    dic = {
                        "pv": pv,
                        "games": t,
                        "win": win,
                        "draw": draw,
                        "lost": lost,
                        "pwin": z(win * 100.0 / t),
                        "pdraw": z(draw * 100.0 / t),
                        "plost": z(lost * 100.0 / t),
                        "pdrawlost": z((draw + lost) * 100.0 / t),
                        "pdrawwin": z((win + draw) * 100.0 / t),
                        "nivel": nli,
                        "game": None,
                    }
                    li_pgn = Game.lipv_lipgn(lipv)
                    nliant = len(antlipv)
                    agrisar = True
                    for x in range(100):
                        iswhite = (x % 2) == 0
                        pgn = li_pgn[x] if x < nli else ""
                        if agrisar:
                            if x >= nliant:
                                agrisar = False
                            elif x < nli:
                                if lipv[x] != antlipv[x]:
                                    agrisar = False
                        dic[str(x)] = (
                            pgn,
                            iswhite,
                            color,
                            info,
                            init_indicator,
                            li_nags,
                            agrisar,
                            is_line,
                        )
                    antlipv = lipv
                    dic["winc"] = dic["pwinc"] = color3(win, draw, lost)
                    dic["drawc"] = dic["pdrawc"] = color3(draw, win, lost)
                    dic["lostc"] = dic["plostc"] = color3(lost, win, draw)
                    dic["pdrawlostc"] = color2(draw + lost, draw + win)
                    dic["pdrawwinc"] = color2(draw + win, draw + lost)
                    dtemp.append(dic)

                liorder = []

                def ordena(empieza, nivel):
                    li = []
                    for uno in dtemp:
                        if uno["nivel"] == nivel and uno["pv"].startswith(empieza):
                            li.append(uno)
                    li.sort(key=lambda rx: f"{rx['games']:5d}{rx['win']:5d}", reverse=True)
                    for uno in li:
                        liorder.append(uno)
                        ordena(uno["pv"], nivel + 1)

                ordena("", 1)
                if side == "white":
                    data[MOVES_WHITE] = liorder
                    self.movesWhite = range(len(liorder))
                else:
                    data[MOVES_BLACK] = liorder
                    self.movesBlack = range(len(liorder))

        self.rebuilding = False
        self.data = data
        self.gridOpeningWhite.refresh()
        self.gridOpeningBlack.refresh()
        self.gridMovesWhite.refresh()
        self.gridMovesBlack.refresh()

        self.gridOpeningWhite.gotop()
        self.gridOpeningBlack.gotop()
        self.gridMovesWhite.gotop()
        self.gridMovesBlack.gotop()
        has_data = any(len(d) > 0 for d in data)
        if not has_data:
            QTMessages.message_information(self, _("Player has no games with moves."))

        self.tab_changed(self.tabs.current_position())
