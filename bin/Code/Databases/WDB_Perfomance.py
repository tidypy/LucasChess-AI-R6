import csv
import os
import webbrowser

from PySide6 import QtCore, QtGui, QtWidgets

import Code
from Code.Z import Util
from Code.QT import Colocacion, Columnas, Controles, Grid, Iconos, QTDialogs, QTMessages, QTUtils, SelectFiles

li_fide = [
    -800,
    -677,
    -589,
    -538,
    -501,
    -470,
    -444,
    -422,
    -401,
    -383,
    -366,
    -351,
    -336,
    -322,
    -309,
    -296,
    -284,
    -273,
    -262,
    -251,
    -240,
    -230,
    -220,
    -211,
    -202,
    -193,
    -184,
    -175,
    -166,
    -158,
    -149,
    -141,
    -133,
    -125,
    -117,
    -110,
    -102,
    -95,
    -87,
    -80,
    -72,
    -65,
    -57,
    -50,
    -43,
    -36,
    -29,
    -21,
    -14,
    -7,
    0,
    7,
    14,
    21,
    29,
    36,
    43,
    50,
    57,
    65,
    72,
    80,
    87,
    95,
    102,
    110,
    117,
    125,
    133,
    141,
    149,
    158,
    166,
    175,
    184,
    193,
    202,
    211,
    220,
    230,
    240,
    251,
    262,
    273,
    284,
    296,
    309,
    322,
    336,
    351,
    366,
    383,
    401,
    422,
    444,
    470,
    501,
    538,
    589,
    677,
    800,
]


class Performance:
    def __init__(self):
        self.dic_elo_player = {"W": [], "B": []}
        self.dic_elo_opponents = {"W": [], "B": []}
        self.dic_elo_results = {"W": [], "B": []}
        self.dic_results = {"W": [], "B": []}
        self.dic_accuracies = {"W": [], "B": []}

    def avg_elo_player(self):
        li_both = self.dic_elo_player["W"] + self.dic_elo_player["B"]
        return int(round(sum(li_both) / len(li_both))) if li_both else None

    def with_data(self):
        return bool(self.dic_results["W"] or self.dic_results["B"])

    def add_game(self, is_white: bool, elo, opponent_elo, result: float, accuracy=None):
        color = "W" if is_white else "B"
        self.dic_results[color].append(result)
        if elo is not None:
            self.dic_elo_player[color].append(elo)
        if opponent_elo is not None:
            self.dic_elo_opponents[color].append(opponent_elo)
            self.dic_elo_results[color].append(result)
        if accuracy is not None:
            self.dic_accuracies[color].append(accuracy)

    def datos_base(self, is_white):
        if is_white is None:
            elo_opponents = self.dic_elo_opponents["W"] + self.dic_elo_opponents["B"]
            results = self.dic_elo_results["W"] + self.dic_elo_results["B"]
        else:
            color = "W" if is_white else "B"
            elo_opponents = self.dic_elo_opponents[color]
            results = self.dic_elo_results[color]
        return elo_opponents, results

    def metric_counts(self):
        total = len(self.dic_results["W"]) + len(self.dic_results["B"])
        elo = len(self.dic_elo_opponents["W"]) + len(self.dic_elo_opponents["B"])
        accuracy = len(self.dic_accuracies["W"]) + len(self.dic_accuracies["B"])
        return total, elo, accuracy

    def estimated_sigmoid_elo(self):
        accuracies = self.dic_accuracies["W"] + self.dic_accuracies["B"]
        if not accuracies:
            return None
        from Code.AI.elo_calculator import SigmoidELOCalculator
        accuracy = SigmoidELOCalculator.calculate_trimmed_mean(accuracies)
        return SigmoidELOCalculator.calculate_sigmoid_elo(accuracy)

    def mathematical_method(self, is_white):
        elo_opponents, results = self.datos_base(is_white)
        num_games = len(elo_opponents)
        if num_games == 0:
            return ""
        sum_results = sum(results)
        if sum_results == 0:
            return max(round(sum(elo_opponents) / num_games - 800), 0)  # Límite inferior práctico
        if sum_results == num_games:
            return round(sum(elo_opponents) / num_games + 800)  # Límite superior práctico

        def expected_score(opponent_ratings, own_rating: float) -> float:
            """How many points we expect to score in a tourney with these opponents"""
            return sum(1 / (1 + 10 ** ((opponent_rating - own_rating) / 400)) for opponent_rating in opponent_ratings)

        score = sum(results)
        mid = 0

        lo, hi = 0, 4000

        while hi - lo > 0.00001:
            mid = (lo + hi) / 2

            if expected_score(elo_opponents, mid) < score:
                lo = mid
            else:
                hi = mid

        return round(mid)

    def fide_method(self, is_white):
        elo_opponents, results = self.datos_base(is_white)
        num_games = len(elo_opponents)
        if num_games == 0:
            return ""

        score = sum(results)
        porc = round(score * 100.0 / num_games)

        avg = sum(elo_opponents) / num_games

        return round(li_fide[porc] + avg)

    def linear_method(self, is_white):
        elo_opponents, results = self.datos_base(is_white)
        if len(elo_opponents) == 0:
            return ""

        num_games = len(elo_opponents)
        score = sum(results)
        porc = score * 100.0 / num_games

        avg = sum(elo_opponents) / num_games

        return round(avg + 8 * porc - 400)

    def according_method(self, tipo, is_white):
        if tipo == "FIDE":
            elo = self.fide_method(is_white)
        elif tipo == "MATH":
            elo = self.mathematical_method(is_white)
        else:
            elo = self.linear_method(is_white)
        return elo

    def str_according_method(self, tipo, is_white):
        elo = self.according_method(tipo, is_white)
        return "" if elo is None else str(elo)

    def int_according_method(self, tipo, is_white):
        elo = self.according_method(tipo, is_white)
        return 0 if elo is None or elo == "" else elo

    def str_score(self):
        wb = self.dic_results["W"] + self.dic_results["B"]
        if len(wb) == 0:
            return ""

        def xcalc(li_results):
            num = len(li_results)
            if num == 0:
                return "      "
            s = sum(li_results)
            return f"{s:.1f}/{num}"

        cw = xcalc(self.dic_results["W"])
        cb = xcalc(self.dic_results["B"])
        cwb = xcalc(wb)
        return f"{cwb} - {cw} - {cb}"

    def str_scorep(self):
        if len(self.dic_results["W"]) + len(self.dic_results["B"]) == 0:
            return ""

        def xcalc(li_results):
            num = len(li_results)
            if num == 0:
                return "      "
            s = sum(li_results) * 100.0 / num
            return f"{s:5.1f}"

        cw = xcalc(self.dic_results["W"])
        cb = xcalc(self.dic_results["B"])
        cwb = xcalc(self.dic_results["W"] + self.dic_results["B"])
        return f"{cwb} -{cw} -{cb}"

    def int_scorep(self):
        num = len(self.dic_results["W"]) + len(self.dic_results["B"])
        if num == 0:
            return 0
        w = sum(self.dic_results["W"])
        b = sum(self.dic_results["B"])
        return (w + b) * 10000 / num + (w + b)

    def int_score(self):
        w = sum(self.dic_results["W"])
        b = sum(self.dic_results["B"])
        return (w + b) * 1000 - len(self.dic_results["W"]) - len(self.dic_results["B"])

    def str_results(self):
        def calc(li_results):
            w = d = ls = 0
            for result in li_results:
                if result == 1:
                    w += 1
                elif result == 0.5:
                    d += 1
                else:
                    ls += 1
            return f"{w}/{d}/{ls}"

        return (
            f"{calc(self.dic_results['W'] + self.dic_results['B'])} - "
            f"{calc(self.dic_results['W'])} - {calc(self.dic_results['B'])}"
        )

    def int_results(self):
        w = d = ls = 0
        for result in self.dic_results["W"] + self.dic_results["B"]:
            if result == 1:
                w += 1
            elif result == 0.5:
                d += 1
            else:
                ls += 1
        return w * 1000000 + d * 1000 + ls

    def str_opponents(self):
        w_op = len(self.dic_elo_opponents["W"])
        b_op = len(self.dic_elo_opponents["B"])
        if w_op + b_op == 0:
            return ""

        def xround(valor, elementos):
            if elementos == 0:
                return "     "
            x = valor / elementos
            ix = int(x)
            decimal = x - ix
            if decimal >= 0.5:
                ix += 1
            return f"{ix:4d}"

        w = xround(sum(self.dic_elo_opponents["W"]), w_op)
        b = xround(sum(self.dic_elo_opponents["B"]), b_op)
        wb = xround(
            sum(self.dic_elo_opponents["W"]) + sum(self.dic_elo_opponents["B"]),
            w_op + b_op,
        )

        return f"{wb} - {w} - {b}"

    def int_opponents(self, is_white):
        w_op = len(self.dic_elo_opponents["W"])
        b_op = len(self.dic_elo_opponents["B"])
        if w_op + b_op == 0:
            return 0
        if is_white is None:
            wb = (sum(self.dic_elo_opponents["W"]) + sum(self.dic_elo_opponents["B"])) // (w_op + b_op)
        elif is_white:
            wb = sum(self.dic_elo_opponents["W"]) // w_op if w_op else 0
        else:
            wb = sum(self.dic_elo_opponents["B"]) // b_op if b_op else 0

        return wb


class WPerfomance(QtWidgets.QWidget):
    def __init__(self, wb_database, wb_games, db_games):
        QtWidgets.QWidget.__init__(self)

        self.wb_database = wb_database
        self.wb_games = wb_games
        self.db_games = db_games

        self.dic_players = None

        self.li_players = []

        self.tipo = "FIDE"
        self.key_vars = "PERFOMANCE"
        self.configuration = Code.configuration
        dic = self.configuration.read_variables(self.key_vars)
        self.tipo = dic.get("TIPO", "FIDE")

        self.last_col = "player"
        self.last_reverse = False

        self.lb_tipo = Controles.LB(self).align_center().set_font_type(puntos=24, peso=500).set_background("lightgray")

        def ayuda():
            url = "https://lucaschess.blogspot.com/2025/05/performance-rating-of-list-of-games.html"
            webbrowser.open(url)

        self.player_filter = None
        self.session_prompted = False
        self.use_accuracy = False
        self.use_engine_elo = False

        self.tb = QTDialogs.LCTB(self)
        self.tb.new(_("Close"), Iconos.MainMenu(), self.wb_database.tw_terminar)
        self.tb.new(_("Generate / Update"), Iconos.Estadisticas(), lambda: self.actualiza(force_prompt=True))
        self.tb.new(_("Select Player"), Iconos.Player32(), self.tw_select_player)
        self.tb.new(_("Export"), Iconos.Export8(), self.export)
        self.tb.new(_("AI Summary"), Iconos.AIChip(), self.tw_ai_summary)
        self.tb.new(_("Pass Data to LM"), Iconos.AIChip(), self.tw_pass_data_to_lm)
        self.tb.new(_("Help"), Iconos.AyudaGR(), ayuda)

        # Search Player Box with autocomplete
        self.ed_search = QtWidgets.QLineEdit(self)
        self.ed_search.setPlaceholderText(_("Begin Typing Name..."))
        self.ed_search.setClearButtonEnabled(True)
        self.ed_search.textChanged.connect(self.on_search_text_changed)

        awb = f"{_('All')} - {_('White')} - {_('Black')}"
        perf = _("Performance")
        o_columns = Columnas.ListaColumnas()
        o_columns.nueva("__num__", _("N."), 50, align_center=True)
        o_columns.nueva("player", _("Player"), 180, align_center=True)
        o_columns.nueva("coverage", f"{_('Games Used')}\n{_('Basic')}/{_('ELO')}/{_('Accuracy')}", 120, align_center=True)
        o_columns.nueva("sigmoid_elo", f"{_('Estimated ELO')}\n({_('From Accuracy')})", 120, align_center=True)
        o_columns.nueva("glicko2", f"{_('Glicko-2')}\n({_('Rating ± RD')})", 120, align_center=True)
        o_columns.nueva("elo", _("Avg Elo"), 80, align_center=True)
        o_columns.nueva("WB", perf, 100, align_center=True)
        o_columns.nueva("W", f"{perf}\n{_('White')}", 90, align_center=True)
        o_columns.nueva("B", f"{perf}\n{_('Black')}", 90, align_center=True)
        o_columns.nueva("scorep", f"%{_('Score')}\n{awb}", 140, align_center=True)
        o_columns.nueva("score", f"{_('Score')}\n{awb}", 160, align_center=True)
        o_columns.nueva(
            "results",
            f"{_('Results')}\n{_('Wins')}/{_('Draws')}/{_('Losses')}",
            180,
            align_center=True,
        )
        o_columns.nueva("opponent", f"{_('Avg Opponent')}\n{awb}", 140, align_center=True)

        font_metrics = QtGui.QFontMetrics(self.font())
        alto_cabecera = font_metrics.height() * 2 + 12

        self.grid = Grid.Grid(self, o_columns, complete_row_select=True, header_heigh=alto_cabecera)

        # Engine Status Badge — actualiza() uses SQLite iteration directly
        from Code.Databases.analytics_engine import HAS_DUCKDB
        if HAS_DUCKDB:
            engine_txt = f"  [{_('DuckDB Available (SQLite Active)')}]"
        else:
            engine_txt = f"  [{_('SQLite Engine Active')}]"
        self.lb_engine_status = Controles.LB(self, engine_txt).set_font_type(is_italic=True)

        ly_search = Colocacion.H().control(Controles.LB(self, f"{_('Search Player')}:")).control(self.ed_search).control(self.lb_engine_status).margen(2)
        ly = Colocacion.V().control(self.tb).otro(ly_search).control(self.grid).margen(1)

        self.setLayout(ly)

    def actualiza(self, force_prompt=False):
        # Always refresh ROWID list to avoid stale references after inserts/deletes
        cursor = self.db_games.conexion.execute("SELECT rowid FROM Games")
        self.db_games.li_row_ids = [r[0] for r in cursor.fetchall()]

        if not self.db_games.li_row_ids:
            self.dic_players = None
            self.li_players = []
            self.grid.refresh()
            QTMessages.message_information(self, _("There are no games in this database."))
            return

        missing_elo_games = 0
        missing_accuracy_games = 0
        if force_prompt:
            self.session_prompted = False

        if not self.session_prompted:
            self.session_prompted = True
            from Code.QT import FormLayout
            li = [(_("Show separately labeled estimated ELO when move accuracy exists"), True)]
            msg = _("Estimated ELO is shown separately and is never used as an official rating or in performance calculations.")
            resultado = FormLayout.fedit(
                li,
                title=_("Estimated ELO"),
                parent=self,
                icon=Iconos.FideBuilding(),
                comment=msg,
            )
            self.use_accuracy = bool(resultado and resultado[1][0])
            self.use_engine_elo = False

        li_regs = self.wb_games.grid.list_selected_recnos()
        if len(li_regs) <= 1 or not li_regs:
            li_regs = range(len(self.db_games.li_row_ids))

        pb = QTMessages.ProgressBarWithTime(self, _("Calculating Performance Matrix..."), formato1="%p%")
        pb.set_total(len(li_regs))
        pb.mostrar()

        dic_players = {}

        # DUAL-ENGINE ARCHITECTURE
        from Code.Databases.analytics_engine import HAS_DUCKDB
        db_path = getattr(self.db_games, "nombre", None)
        
        duckdb_success = False
        if HAS_DUCKDB and db_path and os.path.isfile(db_path):
            # 1. DUCKDB FAST PATH
            import duckdb
            import pandas as pd
            self.db_games.conexion.commit() # Release SQLite read lock for Windows
            try:
                try:
                    con = duckdb.connect(database=":memory:")
                    try:
                        con.execute("LOAD sqlite;")
                    except Exception:
                        con.execute("INSTALL sqlite; LOAD sqlite;")
                    escaped_db_path = db_path.replace("'", "''")
                    con.execute(f"ATTACH '{escaped_db_path}' AS db (TYPE SQLITE, READ_ONLY);")
                    if len(li_regs) == len(self.db_games.li_row_ids):
                        where_clause = "WHERE 1=1"
                    else:
                        recno_str = ",".join(str(self.db_games.li_row_ids[r]) for r in li_regs)
                        where_clause = f"WHERE rowid IN ({recno_str})"
                    
                    if self.player_filter:
                        escaped_filter = self.player_filter.replace("'", "''")
                        where_clause += f" AND (LOWER(TRIM(WHITE)) = LOWER('{escaped_filter}') OR LOWER(TRIM(BLACK)) = LOWER('{escaped_filter}'))"
    
                    fields = getattr(self.db_games, "st_fields", set())
                    w_elo_expr = "TRY_CAST(WHITEELO AS INTEGER)" if "WHITEELO" in fields else "NULL"
                    b_elo_expr = "TRY_CAST(BLACKELO AS INTEGER)" if "BLACKELO" in fields else "NULL"
                    query = f"""
                        SELECT 
                            rowid, WHITE, BLACK, RESULT,
                            {w_elo_expr} as w_elo,
                            {b_elo_expr} as b_elo
                        FROM db.Games 
                        {where_clause}
                    """
                    df = con.execute(query).df()
                finally:
                    con.close()
                    
                import re
                re_welo = re.compile(r'\[WhiteElo\s+"([0-9]+)"\]')
                re_belo = re.compile(r'\[BlackElo\s+"([0-9]+)"\]')
                re_wacc = re.compile(r'\[WhiteAccuracy\s+"([0-9.]+)"\]')
                re_bacc = re.compile(r'\[BlackAccuracy\s+"([0-9.]+)"\]')
                total_rows = len(df)
                for idx, row in df.iterrows():
                    if idx % 50 == 0:
                        pb.pon(idx)
                        if pb.is_canceled():
                            break
                    white = str(row.get("WHITE", "") or "").strip()
                    black = str(row.get("BLACK", "") or "").strip()
                    if not white or not black:
                        continue
                        
                    res = str(row.get("RESULT", "") or "").strip()
                    if res in ("1-0", "1:0"):
                        result_w, result_b = 1.0, 0.0
                    elif res in ("0-1", "0:1"):
                        result_w, result_b = 0.0, 1.0
                    elif res in ("1/2-1/2", "1/2", "0.5-0.5", "=", "0.5"):
                        result_w, result_b = 0.5, 0.5
                    else:
                        continue
    
                    w_elo = row.get("w_elo")
                    w_elo = int(w_elo) if pd.notna(w_elo) and w_elo > 0 else 0
                    
                    b_elo = row.get("b_elo")
                    b_elo = int(b_elo) if pd.notna(b_elo) and b_elo > 0 else 0
                    w_accuracy = None
                    b_accuracy = None

                    if w_elo == 0 or b_elo == 0 or self.use_accuracy:
                        rowid = int(row.get("rowid"))
                        c = self.db_games.conexion.execute("SELECT _DATA_ FROM Games WHERE rowid=?", (rowid,))
                        raw_data = c.fetchone()
                        data_str = raw_data[0] if raw_data and raw_data[0] else ""
                        if isinstance(data_str, bytes):
                            data_str = data_str.decode('utf-8', errors='ignore')
                            
                        if w_elo == 0:
                            mw = re_welo.search(data_str)
                            if mw: w_elo = int(mw.group(1))
                        if b_elo == 0:
                            mb = re_belo.search(data_str)
                            if mb: b_elo = int(mb.group(1))
                            
                        if self.use_accuracy:
                            aw = re_wacc.search(data_str)
                            ab = re_bacc.search(data_str)
                            w_accuracy = float(aw.group(1)) if aw else None
                            b_accuracy = float(ab.group(1)) if ab else None
                            w_accuracy = w_accuracy if w_accuracy is not None and 0.0 <= w_accuracy <= 100.0 else None
                            b_accuracy = b_accuracy if b_accuracy is not None and 0.0 <= b_accuracy <= 100.0 else None

                    w_elo = w_elo or None
                    b_elo = b_elo or None
                    if w_elo is None or b_elo is None:
                        missing_elo_games += 1
                    if self.use_accuracy and (w_accuracy is None or b_accuracy is None):
                        missing_accuracy_games += 1

                    if white not in dic_players:
                        dic_players[white] = Performance()
                    dic_players[white].add_game(True, w_elo, b_elo, result_w, w_accuracy)
                    if black not in dic_players:
                        dic_players[black] = Performance()
                    dic_players[black].add_game(False, b_elo, w_elo, result_b, b_accuracy)
                duckdb_success = True
            except Exception as e:
                import traceback
                traceback.print_exc()
                print(f"DuckDB Error: {e}, falling back to SQLite")
                dic_players.clear()
                missing_elo_games = 0
                missing_accuracy_games = 0
                pb.etiqueta.setText(_("Calculating Performance Matrix (SQLite Fallback)..."))
                pb.set_total(len(li_regs))

        if not duckdb_success:
            # 2. SQLITE OPTIMIZED FALLBACK (No full PGN deserialization)
            import re
            if len(li_regs) == len(self.db_games.li_row_ids):
                where_clause = "WHERE 1=1"
            else:
                recno_str = ",".join(str(self.db_games.li_row_ids[r]) for r in li_regs)
                where_clause = f"WHERE rowid IN ({recno_str})"

            if self.player_filter:
                escaped_filter = self.player_filter.replace("'", "''")
                where_clause += f" AND (LOWER(TRIM(WHITE)) = LOWER('{escaped_filter}') OR LOWER(TRIM(BLACK)) = LOWER('{escaped_filter}'))"
            fields = getattr(self.db_games, "st_fields", set())
            w_elo_expr = "WHITEELO" if "WHITEELO" in fields else "NULL"
            b_elo_expr = "BLACKELO" if "BLACKELO" in fields else "NULL"
            query = f"SELECT WHITE, BLACK, RESULT, {w_elo_expr}, {b_elo_expr}, _DATA_ FROM Games {where_clause}"
            cursor = self.db_games.conexion.execute(query)
            
            re_welo = re.compile(r'\[WhiteElo\s+"([0-9]+)"\]')
            re_belo = re.compile(r'\[BlackElo\s+"([0-9]+)"\]')
            re_wacc = re.compile(r'\[WhiteAccuracy\s+"([0-9.]+)"\]')
            re_bacc = re.compile(r'\[BlackAccuracy\s+"([0-9.]+)"\]')
            
            for idx, raw in enumerate(cursor):
                if idx % 50 == 0:
                    pb.pon(idx)
                    if pb.is_canceled():
                        break
                        
                white = (raw[0] or "").strip()
                black = (raw[1] or "").strip()
                if not white or not black: continue
                
                res = (raw[2] or "").strip()
                if res in ("1-0", "1:0"): result_w, result_b = 1.0, 0.0
                elif res in ("0-1", "0:1"): result_w, result_b = 0.0, 1.0
                elif res in ("1/2-1/2", "1/2", "0.5-0.5", "=", "0.5"): result_w, result_b = 0.5, 0.5
                else: continue
                
                try:
                    w_elo = int(raw[3])
                    if w_elo <= 0:
                        w_elo = 0
                except (TypeError, ValueError):
                    w_elo = 0
                try:
                    b_elo = int(raw[4])
                    if b_elo <= 0:
                        b_elo = 0
                except (TypeError, ValueError):
                    b_elo = 0
                
                data_str = raw[5] or ""
                if isinstance(data_str, bytes):
                    data_str = data_str.decode('utf-8', errors='ignore')
                
                if w_elo == 0:
                    m = re_welo.search(data_str)
                    if m: w_elo = int(m.group(1))
                if b_elo == 0:
                    m = re_belo.search(data_str)
                    if m: b_elo = int(m.group(1))
                    
                w_accuracy = None
                b_accuracy = None
                if self.use_accuracy:
                    m = re_wacc.search(data_str)
                    if m:
                        value = float(m.group(1))
                        w_accuracy = value if 0.0 <= value <= 100.0 else None
                    m = re_bacc.search(data_str)
                    if m:
                        value = float(m.group(1))
                        b_accuracy = value if 0.0 <= value <= 100.0 else None

                w_elo = w_elo or None
                b_elo = b_elo or None
                if w_elo is None or b_elo is None:
                    missing_elo_games += 1
                if self.use_accuracy and (w_accuracy is None or b_accuracy is None):
                    missing_accuracy_games += 1

                if white not in dic_players:
                    dic_players[white] = Performance()
                dic_players[white].add_game(True, w_elo, b_elo, result_w, w_accuracy)
                if black not in dic_players:
                    dic_players[black] = Performance()
                dic_players[black].add_game(False, b_elo, w_elo, result_b, b_accuracy)

        pb.cerrar()

        if dic_players:
            self.dic_players = dic_players
            if self.player_filter and self.player_filter in self.dic_players:
                self.li_players = [self.player_filter]
            else:
                self.li_players = [player for player, perf in self.dic_players.items() if perf.with_data()]
                self.li_players.sort(key=lambda x: x.upper())
            self.grid.refresh()
            if self.li_players:
                completer = QtWidgets.QCompleter(self.li_players, self.ed_search)
                completer.setCaseSensitivity(QtCore.Qt.CaseInsensitive)
                completer.setFilterMode(QtCore.Qt.MatchContains)
                self.ed_search.setCompleter(completer)
            
            if missing_elo_games or missing_accuracy_games:
                QTMessages.temporary_message(
                    self,
                    _("Partial results: %d games were excluded from ELO-based metrics and %d games were excluded from accuracy-based metrics because required data is missing.")
                    % (missing_elo_games, missing_accuracy_games),
                    5.0,
                )
        else:
            self.dic_players = None
            self.li_players = []
            self.grid.refresh()
            QTMessages.message_information(self, _("There are no games with valid player names and results in this database."))

    def tw_select_player(self):
        from Code.QT import FormLayout
        lp = self.db_games.players()
        if len(lp) == 0:
            QTMessages.message_information(self, _("No players were found in this database."))
            return
        lista = [(player, player) for player in lp]
        lista.insert(0, (_("All Players"), ""))
        config = FormLayout.Combobox(_("Player"), lista, extend_seek=True)
        resultado = FormLayout.fedit(
            [(config, self.player_filter if self.player_filter else "")],
            title=_("Select Player"),
            parent=self,
            minimum_width=250,
            icon=Iconos.Player32(),
        )
        if resultado:
            _accion, (name,) = resultado
            self.player_filter = name if name else None
            self.actualiza()

    def tw_ai_summary(self):
        if not self.dic_players:
            QTMessages.message_information(self, _("Please generate performance statistics first."))
            return
        from Code.AI.StatsSummary import StatsSummaryFormatter, generate_stats_summary_async

        target_player = self.player_filter
        if not target_player and self.li_players:
            target_player = self.li_players[0]

        perf_obj = self.dic_players.get(target_player) if target_player else list(self.dic_players.values())[0]
        if perf_obj is None:
            QTMessages.message_information(self, _("Player has no valid games for analytics."))
            return
        stats_data = StatsSummaryFormatter.format_performance_data(target_player, perf_obj, filter_name=self.player_filter)

        generate_stats_summary_async(self, stats_data, title=_("AI Performance Summary"))

    def on_search_text_changed(self, text):
        if not self.dic_players:
            return
        query = text.strip().upper()
        if query:
            self.li_players = [p for p, perf in self.dic_players.items() if query in p.upper() and perf.with_data()]
        else:
            self.li_players = [p for p, perf in self.dic_players.items() if perf.with_data()]
        self.li_players.sort(key=lambda x: x.upper())
        self.grid.refresh()

    def tw_pass_data_to_lm(self):
        self.tw_ai_summary()

    def show_type(self):
        if self.tipo == "FIDE":
            label = _("Fide method")
        elif self.tipo == "MATH":
            label = _("Mathematical method")
        else:
            label = _("Linear method")
        self.lb_tipo.set_text(label)

    def configurar(self):
        menu = QTDialogs.LCMenu(self)
        if self.tipo != "FIDE":
            menu.opcion(self.fide, _("Fide method"), Iconos.FideBuilding())
        if self.tipo != "MATH":
            menu.opcion(self.mathematical, _("Mathematical method"), Iconos.Math())
        if self.tipo != "LINEAR":
            menu.opcion(self.linear, _("Linear method"), Iconos.Linear())
        resp = menu.lanza()
        if resp:
            resp()

    def change_tipo(self, tipo):
        self.tipo = tipo
        self.show_type()
        self.grid.refresh()
        dic = self.configuration.read_variables(self.key_vars)
        dic["TIPO"] = self.tipo
        self.configuration.write_variables(self.key_vars, dic)

    def fide(self):
        self.change_tipo("FIDE")

    def mathematical(self):
        self.change_tipo("MATH")

    def linear(self):
        self.change_tipo("LINEAR")

    def grid_num_datos(self, _grid):
        return len(self.li_players)

    def grid_dato(self, _grid, row, obj_column):
        col = obj_column.key
        player = self.li_players[row]
        if col == "player":
            return player
        if col == "__num__":
            return str(row + 1)

        performance: Performance = self.dic_players[self.li_players[row]]
        if col == "coverage":
            return "%d/%d/%d" % performance.metric_counts()
        if col == "sigmoid_elo":
            estimated_elo = performance.estimated_sigmoid_elo() if self.use_accuracy else None
            return str(estimated_elo) if estimated_elo is not None else "—"
        if col == "glicko2":
            return "—"
        if col == "elo":
            elo = performance.avg_elo_player()
            return str(elo) if elo is not None else "—"
        if col == "WB":
            return performance.str_according_method(self.tipo, None) or "—"
        if col == "W":
            return performance.str_according_method(self.tipo, True) or "—"
        if col == "B":
            return performance.str_according_method(self.tipo, False) or "—"
        if col == "scorep":
            return performance.str_scorep()
        if col == "score":
            return performance.str_score()
        if col == "opponent":
            return performance.str_opponents() or "—"
        if col == "results":
            return performance.str_results()
        return None

    def grid_doubleclick_header(self, _grid, obj_column):
        col = obj_column.key
        if col == "__num__":
            return

        def element(player):
            performance: Performance = self.dic_players[player]
            if col == "WB":
                return performance.int_according_method(self.tipo, None) * 10000 + performance.int_opponents(None)
            if col == "W":
                return performance.int_according_method(self.tipo, True) * 10000 + performance.int_opponents(True)
            if col == "B":
                return performance.int_according_method(self.tipo, False) * 10000 + performance.int_opponents(False)
            if col == "score":
                return performance.int_score()
            if col == "scorep":
                return performance.int_scorep()
            if col == "opponent":
                return performance.int_opponents(None)
            if col == "results":
                return performance.int_results()
            if col == "player":
                return player.upper()
            if col == "elo":
                return performance.avg_elo_player() or -1
            if col == "coverage":
                total, elo, accuracy = performance.metric_counts()
                return total * 1000000 + elo * 1000 + accuracy
            return -1

        reset = False

        if col == self.last_col:
            if obj_column.head.endswith(" -"):
                reset = True
            self.last_reverse = not self.last_reverse

        else:
            self.last_reverse = False
            self.last_col = col

        for column in self.grid.o_columns.li_columns:
            if column.head.endswith((" +", " -")):
                column.head = column.head[:-2]

        if reset:
            col = "player"
            self.li_players.sort(key=element)
            self.last_reverse = False
            self.last_col = col
        else:
            obj_column.head = obj_column.head + (" -" if self.last_reverse else " +")
            self.li_players.sort(key=element, reverse=self.last_reverse)
        self.grid.refresh()

    def grid_right_button(self, grid, row, col, _modif):
        key = col.key
        if key.startswith("__"):
            return
        val = self.grid_dato(grid, row, col)
        if val:
            val = str(val)
            QTUtils.set_clipboard(val)
            QTMessages.temporary_message(
                self,
                f"{val}<br><br>{_('It is saved in the clipboard to paste it wherever you want.')}",
                2.0,
            )

    def grid_tecla_control(self, _grid, k, _is_shift, _is_control, is_alt):
        if k == QtCore.Qt.Key.Key_R and is_alt:
            self.grid.resizeColumnsToContents()
            return False
        else:
            return True  # que siga con el resto de teclas

    def export(self):
        menu = QTDialogs.LCMenu(self)

        menu.opcion("csv", _("To a CSV file"), Iconos.CSV())
        menu.separador()

        resp = menu.lanza()
        if resp:
            self.export_csv()

    def export_csv(self):
        dic_csv = self.configuration.read_variables("CSV")
        path_csv = SelectFiles.save_file(
            self,
            f"{_('Export')} - {_('To a CSV file')}",
            dic_csv.get("FOLDER", self.configuration.paths.folder_userdata()),
            "csv",
        )
        if not path_csv:
            return
        if not path_csv.lower().endswith(".csv"):
            path_csv = f"{path_csv.strip()}.csv"
        dic_csv["FOLDER"] = os.path.dirname(path_csv)
        self.configuration.write_variables("CSV", dic_csv)
        li_cols = []
        for col in self.grid.columns_displayables.li_columns:
            key = col.key
            if key.startswith("__"):
                continue
            li_cols.append(col)

        with open(path_csv, mode="w", newline="") as file:
            writer = csv.writer(file)
            li_data = []
            for col in li_cols:
                if col.key == "WB":
                    if self.tipo == "FIDE":
                        label = _("Fide method")
                    elif self.tipo == "MATH":
                        label = _("Mathematical method")
                    else:
                        label = _("Linear method")
                    li_data.append(label)
                else:
                    li_data.append(col.head.replace(" (+)", "").replace(" (-)", ""))
            writer.writerow(li_data)

            for recno in range(len(self.li_players)):
                li_data = []
                for col in li_cols:
                    li_data.append(self.grid_dato(self.grid, recno, col))
                writer.writerow(li_data)
        Util.startfile(path_csv)
