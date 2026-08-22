import fnmatch
import webbrowser

from PySide6 import QtCore, QtWidgets

import Code
from Code.QT import Colocacion, Controles, Iconos, LCDialog, QTDialogs, QTMessages
from Code.SQL import UtilSQL


class WFiltrar(QtWidgets.QDialog):
    def __init__(self, w_parent, li_filter, db_save_nom=None):
        super(WFiltrar, self).__init__(w_parent)

        self.setAttribute(QtCore.Qt.WidgetAttribute.WA_DeleteOnClose, True)
        self.setWindowTitle(_("Filter Database"))
        self.setWindowFlags(
            QtCore.Qt.WindowType.WindowCloseButtonHint
            | QtCore.Qt.WindowType.Dialog
            | QtCore.Qt.WindowType.WindowTitleHint
        )
        self.setWindowIcon(Iconos.Filtrar())
        self.setMinimumWidth(720)

        # Default dictionary structure if li_filter is not a dict (backwards compatibility)
        self.li_filter = li_filter if isinstance(li_filter, dict) else {}
        self.db_save_nom = db_save_nom

        f = Controles.FontType(puntos=11)
        f_sub = Controles.FontType(puntos=9)

        # UI Components — Left Column
        self.ed_white = Controles.ED(self, self.li_filter.get("white", "")).set_font(f)
        self.ed_black = Controles.ED(self, self.li_filter.get("black", "")).set_font(f)
        self.cb_ignore_color = Controles.CHB(self, _("Ignore Color (search both)"), self.li_filter.get("ignore_color", False)).set_font(f)

        self.ed_min_elo = Controles.ED(self, self.li_filter.get("min_elo", "")).set_font(f)
        self.ed_min_elo.setFixedWidth(60)
        self.ed_max_elo = Controles.ED(self, self.li_filter.get("max_elo", "")).set_font(f)
        self.ed_max_elo.setFixedWidth(60)
        self.ed_min_moves = Controles.ED(self, self.li_filter.get("min_moves", "")).set_font(f)
        self.ed_min_moves.setFixedWidth(60)
        self.ed_max_moves = Controles.ED(self, self.li_filter.get("max_moves", "")).set_font(f)
        self.ed_max_moves.setFixedWidth(60)
        self.ed_year = Controles.ED(self, self.li_filter.get("year", "")).set_font(f)
        self.ed_year.setFixedWidth(60)

        # Result checkboxes
        res = self.li_filter.get("results", [])
        self.cb_res_10 = Controles.CHB(self, "1-0", "1-0" in res).set_font(f)
        self.cb_res_01 = Controles.CHB(self, "0-1", "0-1" in res).set_font(f)
        self.cb_res_12 = Controles.CHB(self, "1/2-1/2", "1/2-1/2" in res).set_font(f)
        self.cb_res_ast = Controles.CHB(self, "*", "*" in res).set_font(f)

        # UI Components — Right Column (Metrics & Advanced)
        self.ed_min_acc = Controles.ED(self, self.li_filter.get("min_acc", "")).set_font(f)
        self.ed_min_acc.setFixedWidth(60)
        self.ed_max_acc = Controles.ED(self, self.li_filter.get("max_acc", "")).set_font(f)
        self.ed_max_acc.setFixedWidth(60)

        self.ed_min_acpl = Controles.ED(self, self.li_filter.get("min_acpl", "")).set_font(f)
        self.ed_min_acpl.setFixedWidth(60)
        self.ed_max_acpl = Controles.ED(self, self.li_filter.get("max_acpl", "")).set_font(f)
        self.ed_max_acpl.setFixedWidth(60)

        self.ed_event = Controles.ED(self, self.li_filter.get("event", "")).set_font(f)
        self.ed_site = Controles.ED(self, self.li_filter.get("site", "")).set_font(f)
        self.ed_eco = Controles.ED(self, self.li_filter.get("eco", "")).set_font(f)
        self.ed_termination = Controles.ED(self, self.li_filter.get("termination", "")).set_font(f)
        self.ed_comment = Controles.ED(self, self.li_filter.get("comment", "")).set_font(f)

        # --- Layout Building ---
        
        # Left Column Layouts
        ly_players = Colocacion.G()
        ly_players.controlc(Controles.LB(self, _("White Player:")).set_font(f), 0, 0)
        ly_players.controlc(self.ed_white, 0, 1)
        ly_players.controlc(Controles.LB(self, _("Black Player:")).set_font(f), 1, 0)
        ly_players.controlc(self.ed_black, 1, 1)
        ly_players.control(self.cb_ignore_color, 2, 0, 1, 2)
        gb_players = QtWidgets.QGroupBox(_("Players"))
        gb_players.setLayout(ly_players)

        ly_details = Colocacion.G()
        ly_details.controlc(Controles.LB(self, _("Min Elo:")).set_font(f), 0, 0)
        ly_details.controlc(self.ed_min_elo, 0, 1)
        ly_details.controlc(Controles.LB(self, _("Max Elo:")).set_font(f), 0, 2)
        ly_details.controlc(self.ed_max_elo, 0, 3)
        ly_details.controlc(Controles.LB(self, _("Min Moves:")).set_font(f), 1, 0)
        ly_details.controlc(self.ed_min_moves, 1, 1)
        ly_details.controlc(Controles.LB(self, _("Max Moves:")).set_font(f), 1, 2)
        ly_details.controlc(self.ed_max_moves, 1, 3)
        ly_details.controlc(Controles.LB(self, _("Year:")).set_font(f), 2, 0)
        ly_details.controlc(self.ed_year, 2, 1)
        
        ly_res = Colocacion.H().control(Controles.LB(self, _("Result:")).set_font(f)).control(self.cb_res_10).control(self.cb_res_01).control(self.cb_res_12).control(self.cb_res_ast).relleno()
        ly_details.otro(ly_res, 3, 0, 1, 4)
        gb_details = QtWidgets.QGroupBox(_("Game Details"))
        gb_details.setLayout(ly_details)

        # Right Column Layouts
        ly_metrics = Colocacion.G()
        ly_metrics.controlc(Controles.LB(self, _("Min Accuracy %:")).set_font(f), 0, 0)
        ly_metrics.controlc(self.ed_min_acc, 0, 1)
        ly_metrics.controlc(Controles.LB(self, _("Max Accuracy %:")).set_font(f), 0, 2)
        ly_metrics.controlc(self.ed_max_acc, 0, 3)
        ly_metrics.controlc(Controles.LB(self, _("Min ACPL:")).set_font(f), 1, 0)
        ly_metrics.controlc(self.ed_min_acpl, 1, 1)
        ly_metrics.controlc(Controles.LB(self, _("Max ACPL:")).set_font(f), 1, 2)
        ly_metrics.controlc(self.ed_max_acpl, 1, 3)
        gb_metrics = QtWidgets.QGroupBox(_("Performance & Quality Metrics"))
        gb_metrics.setLayout(ly_metrics)

        ly_adv = Colocacion.G()
        ly_adv.controlc(Controles.LB(self, _("Event:")).set_font(f), 0, 0)
        ly_adv.controlc(self.ed_event, 0, 1)
        ly_adv.controlc(Controles.LB(self, _("Site:")).set_font(f), 1, 0)
        ly_adv.controlc(self.ed_site, 1, 1)
        ly_adv.controlc(Controles.LB(self, _("ECO / Opening:")).set_font(f), 2, 0)
        ly_adv.controlc(self.ed_eco, 2, 1)
        ly_adv.controlc(Controles.LB(self, _("Termination:")).set_font(f), 3, 0)
        ly_adv.controlc(self.ed_termination, 3, 1)
        ly_adv.controlc(Controles.LB(self, _("Comment / Movetext:")).set_font(f), 4, 0)
        ly_adv.controlc(self.ed_comment, 4, 1)
        gb_adv = QtWidgets.QGroupBox(_("Advanced & Metadata Search"))
        gb_adv.setLayout(ly_adv)

        # Split into 2 columns
        ly_left = Colocacion.V().control(gb_players).control(gb_details).relleno()
        ly_right = Colocacion.V().control(gb_metrics).control(gb_adv).relleno()
        ly_columns = Colocacion.H().otro(ly_left).otro(ly_right)

        # Top notice and toolbar
        lb_notice = Controles.LB(self, _("ℹ Text searches perform automatic partial matching (no wildcard % needed).")).set_font(f_sub)
        
        tb = QTDialogs.LCTB(self)
        tb.new(_("Accept"), Iconos.Aceptar(), self.aceptar)
        tb.new(_("Cancel"), Iconos.Cancelar(), self.reject)
        tb.new(_("Clear All"), Iconos.Reiniciar(), self.reiniciar)

        main_layout = Colocacion.V().control(tb).control(lb_notice).otro(ly_columns).margen(8)
        self.setLayout(main_layout)

    def reiniciar(self):
        self.ed_white.set_text("")
        self.ed_black.set_text("")
        self.cb_ignore_color.set_value(False)
        self.ed_event.set_text("")
        self.ed_site.set_text("")
        self.ed_eco.set_text("")
        self.ed_termination.set_text("")
        self.ed_comment.set_text("")
        self.ed_min_elo.set_text("")
        self.ed_max_elo.set_text("")
        self.ed_min_moves.set_text("")
        self.ed_max_moves.set_text("")
        self.ed_min_acc.set_text("")
        self.ed_max_acc.set_text("")
        self.ed_min_acpl.set_text("")
        self.ed_max_acpl.set_text("")
        self.ed_year.set_text("")
        self.cb_res_10.set_value(False)
        self.cb_res_01.set_value(False)
        self.cb_res_12.set_value(False)
        self.cb_res_ast.set_value(False)

    def lee_filtro_actual(self):
        res = []
        if self.cb_res_10.valor(): res.append("1-0")
        if self.cb_res_01.valor(): res.append("0-1")
        if self.cb_res_12.valor(): res.append("1/2-1/2")
        if self.cb_res_ast.valor(): res.append("*")
        
        self.li_filter = {
            "white": self.ed_white.texto().strip(),
            "black": self.ed_black.texto().strip(),
            "ignore_color": self.cb_ignore_color.valor(),
            "event": self.ed_event.texto().strip(),
            "site": self.ed_site.texto().strip(),
            "eco": self.ed_eco.texto().strip(),
            "termination": self.ed_termination.texto().strip(),
            "comment": self.ed_comment.texto().strip(),
            "min_elo": self.ed_min_elo.texto().strip(),
            "max_elo": self.ed_max_elo.texto().strip(),
            "min_moves": self.ed_min_moves.texto().strip(),
            "max_moves": self.ed_max_moves.texto().strip(),
            "min_acc": self.ed_min_acc.texto().strip(),
            "max_acc": self.ed_max_acc.texto().strip(),
            "min_acpl": self.ed_min_acpl.texto().strip(),
            "max_acpl": self.ed_max_acpl.texto().strip(),
            "year": self.ed_year.texto().strip(),
            "results": res
        }
        return True

    def aceptar(self):
        self.lee_filtro_actual()
        self.accept()

    def where(self):
        conds = []
        
        w = self.li_filter.get("white", "")
        b = self.li_filter.get("black", "")
        ignore = self.li_filter.get("ignore_color", False)
        
        if w and b:
            if ignore:
                conds.append(f"((White LIKE '%{w}%' AND Black LIKE '%{b}%') OR (White LIKE '%{b}%' AND Black LIKE '%{w}%'))")
            else:
                conds.append(f"(White LIKE '%{w}%' AND Black LIKE '%{b}%')")
        elif w:
            if ignore:
                conds.append(f"(White LIKE '%{w}%' OR Black LIKE '%{w}%')")
            else:
                conds.append(f"White LIKE '%{w}%'")
        elif b:
            if ignore:
                conds.append(f"(White LIKE '%{b}%' OR Black LIKE '%{b}%')")
            else:
                conds.append(f"Black LIKE '%{b}%'")
                
        evt = self.li_filter.get("event", "")
        if evt:
            conds.append(f"Event LIKE '%{evt}%'")
            
        site = self.li_filter.get("site", "")
        if site:
            conds.append(f"Site LIKE '%{site}%'")
            
        eco = self.li_filter.get("eco", "")
        if eco:
            conds.append(f"(ECO LIKE '%{eco}%' OR Opening LIKE '%{eco}%')")

        term = self.li_filter.get("termination", "")
        if term:
            conds.append(f"Termination LIKE '%{term}%'")

        cmt = self.li_filter.get("comment", "")
        if cmt:
            conds.append(f"_DATA_ LIKE '%{cmt}%'")
            
        min_elo = self.li_filter.get("min_elo", "")
        max_elo = self.li_filter.get("max_elo", "")
        if min_elo.isdigit():
            conds.append(f"(CAST(WhiteElo AS integer) >= {min_elo} OR CAST(BlackElo AS integer) >= {min_elo})")
        if max_elo.isdigit():
            conds.append(f"(CAST(WhiteElo AS integer) <= {max_elo} AND CAST(BlackElo AS integer) <= {max_elo})")
            
        min_m = self.li_filter.get("min_moves", "")
        max_m = self.li_filter.get("max_moves", "")
        if min_m.isdigit():
            conds.append(f"(CAST(Plies AS integer)/2) >= {min_m}")
        if max_m.isdigit():
            conds.append(f"(CAST(Plies AS integer)/2) <= {max_m}")

        min_acc = self.li_filter.get("min_acc", "")
        max_acc = self.li_filter.get("max_acc", "")
        if min_acc:
            try:
                val = float(min_acc)
                conds.append(f"(CAST(WHITEACCURACY AS float) >= {val} OR CAST(BLACKACCURACY AS float) >= {val})")
            except ValueError: pass
        if max_acc:
            try:
                val = float(max_acc)
                conds.append(f"(CAST(WHITEACCURACY AS float) <= {val} AND CAST(BLACKACCURACY AS float) <= {val})")
            except ValueError: pass

        min_acpl = self.li_filter.get("min_acpl", "")
        max_acpl = self.li_filter.get("max_acpl", "")
        if min_acpl:
            try:
                val = float(min_acpl)
                conds.append(f"(CAST(ACPLWHITE AS float) >= {val} OR CAST(ACPLBLACK AS float) >= {val})")
            except ValueError: pass
        if max_acpl:
            try:
                val = float(max_acpl)
                conds.append(f"(CAST(ACPLWHITE AS float) <= {val} AND CAST(ACPLBLACK AS float) <= {val})")
            except ValueError: pass
            
        yr = self.li_filter.get("year", "")
        if yr:
            conds.append(f"Date LIKE '{yr}%'")
            
        res = self.li_filter.get("results", [])
        if res:
            res_cond = " OR ".join([f"Result = '{r}'" for r in res])
            conds.append(f"({res_cond})")
            
        if not conds:
            return ""
            
        return " AND ".join(conds)

class EMSQL(Controles.EM):
    def __init__(self, owner, where, li_fields):
        self.li_fields = li_fields
        Controles.EM.__init__(self, owner, where, is_html=False)

    def mousePressEvent(self, event):
        Controles.EM.mousePressEvent(self, event)
        if event.button() == QtCore.Qt.MouseButton.RightButton:
            menu = QTDialogs.LCMenu(self)
            rondo = QTDialogs.rondo_puntos()
            for txt, key in self.li_fields:
                menu.opcion(key, txt, rondo.otro())
            resp = menu.lanza()
            if resp:
                self.insert_text(resp)


class WFiltrarRaw(LCDialog.LCDialog):
    def __init__(self, w_parent, o_columns, where):
        LCDialog.LCDialog.__init__(self, w_parent, _("Filter"), Iconos.Filtrar(), "rawfilter")

        self.where = ""
        li_fields = [(x.head, x.key) for x in o_columns.li_columns if x.key != "__num__"]
        f = Controles.FontType(puntos=12)  # 0, peso=75 )

        lb_raw = Controles.LB(self, f"{_('Raw SQL')}:").set_font(f)
        self.edRaw = EMSQL(self, where, li_fields).fixed_height(72).minimum_width(512).set_font(f)

        lb_help = Controles.LB(self, _("Right button to select a column of database")).set_font(f)
        ly_help = Colocacion.H().relleno().control(lb_help).relleno()

        ly = Colocacion.H().control(lb_raw).control(self.edRaw)

        # Toolbar
        li_acciones = [
            (_("Accept"), Iconos.Aceptar(), self.aceptar),
            None,
            (_("Cancel"), Iconos.Cancelar(), self.reject),
            None,
        ]
        tb = QTDialogs.LCTB(self, li_acciones)

        # Layout
        layout = Colocacion.V().control(tb).otro(ly).otro(ly_help).margen(3)
        self.setLayout(layout)

        self.edRaw.setFocus()

        self.restore_video(with_tam=False)

    def aceptar(self):
        self.where = self.edRaw.texto()
        self.save_video()
        self.accept()


def make_filter_func(li_filter):
    """Crea una función filtro a partir de la lista de condiciones de WFiltrarPGN.

    Args:
        li_filter: lista de [union, campo, condicion, valor]
            union: None | "AND" | "OR"
            campo: nombre de la etiqueta PGN (str)
            condicion: "=" | "<>" | ">" | "<" | ">=" | "<=" | "LIKE" | "NOT LIKE" | "EMPTY" | "NOT EMPTY"
            valor: str

    Returns:
        función filter_func(d_cab) -> bool
    """

    def _match_one(d_cab, campo, condicion, valor):
        v = d_cab.get(campo, "") or ""
        if condicion == "EMPTY":
            return v.strip() == ""
        if condicion == "NOT EMPTY":
            return v.strip() != ""
        if condicion in ("LIKE", "NOT LIKE"):
            pattern = valor.replace("*", "*").upper()
            if "%" in pattern:
                pattern = pattern.replace("%", "*")
            matched = fnmatch.fnmatch(v.upper(), f"*{pattern}*" if "*" not in pattern else pattern)
            return matched if condicion == "LIKE" else not matched
        # Comparaciones
        try:
            vi = int(v)
            va = int(valor)
            if condicion == "=":
                return vi == va
            if condicion == "<>":
                return vi != va
            if condicion == ">":
                return vi > va
            if condicion == "<":
                return vi < va
            if condicion == ">=":
                return vi >= va
            if condicion == "<=":
                return vi <= va
        except (ValueError, TypeError):
            pass
        v_up = v.upper()
        valor_up = valor.upper()
        if condicion == "=":
            return v_up == valor_up
        if condicion == "<>":
            return v_up != valor_up
        if condicion == ">":
            return v_up > valor_up
        if condicion == "<":
            return v_up < valor_up
        if condicion == ">=":
            return v_up >= valor_up
        if condicion == "<=":
            return v_up <= valor_up
        return True

    def filter_func(d_cab):
        result = None
        for union, campo, condicion, valor in li_filter:
            if not campo or not condicion:
                continue
            matched = _match_one(d_cab, campo, condicion, valor)
            if result is None:
                result = matched
            elif union == "OR":
                result = result or matched
            else:  # AND (default)
                result = result and matched
        return result if result is not None else True

    return filter_func


class WFiltrarPGN(LCDialog.LCDialog):
    """Diálogo de filtro previo para importación de PGN.

    Permite definir hasta 6 condiciones sobre las etiquetas encontradas en el escaneo.
    """

    NUM_ROWS = 6

    def __init__(self, w_parent, st_tags, dic_tags):
        LCDialog.LCDialog.__init__(self, w_parent, _("Pre-filter for PGN import"), Iconos.Filtrar(), "filtrar_pgn")

        self.li_filter = []

        # --- Listas para los combos ---
        # Campos disponibles: etiquetas encontradas, ordenadas
        li_fields = [("", None), (_("Movements"), "PLYCOUNT")]
        # Etiquetas estándar primero, luego el resto
        standard_first = ["WHITE", "BLACK", "RESULT", "WHITEELO", "BLACKELO", "EVENT", "SITE", "DATE", "ECO"]
        all_tags = sorted(st_tags.keys(), key=lambda t: (0 if t.upper() in standard_first else 1, t.upper()))
        for tag in all_tags:
            li_fields.append((dic_tags[tag], tag))

        li_condicion = [
            ("", None),
            (_("Equal"), "="),
            (_("Not equal"), "<>"),
            (_("Greater than"), ">"),
            (_("Less than"), "<"),
            (_("Greater than or equal"), ">="),
            (_("Less than or equal"), "<="),
            (_("Like (wildcard = *)"), "LIKE"),
            (_("Not like (wildcard = *)"), "NOT LIKE"),
            (_("Is empty"), "EMPTY"),
            (_("Is not empty"), "NOT EMPTY"),
        ]
        li_union = [("", None), (_("AND"), "AND"), (_("OR"), "OR")]

        f = Controles.FontType(puntos=11)
        lb_col = Controles.LB(self, _("Column")).set_font(f)
        lb_con = Controles.LB(self, _("Condition")).set_font(f)
        lb_val = Controles.LB(self, _("Value")).set_font(f)
        lb_uni = Controles.LB(self, "+").set_font(f)

        ly = Colocacion.G()
        ly.controlc(lb_uni, 0, 0).controlc(lb_col, 0, 1).controlc(lb_con, 0, 2).controlc(lb_val, 0, 3)

        self._li_c = []
        for i in range(self.NUM_ROWS):
            if i > 0:
                c_union = Controles.CB(self, li_union, None)
                ly.controlc(c_union, i + 1, 0)
            else:
                c_union = None

            c_campo = Controles.CB(self, li_fields, None)
            ly.controlc(c_campo, i + 1, 1)

            c_condicion = Controles.CB(self, li_condicion, None)
            ly.controlc(c_condicion, i + 1, 2)

            # Valor: combo box editable
            c_valor = Controles.CB(self, [], "", extend_seek=True).set_font(f)
            c_valor.setFixedWidth(Controles.calc_fixed_width(240))
            ly.controlc(c_valor, i + 1, 3)

            # Al cambiar el campo, rellenar el combobox de valor
            c_campo.currentIndexChanged.connect(lambda idx, row=i: self._on_campo_changed(row))

            self._li_c.append((c_union, c_campo, c_condicion, c_valor))

        # Guardamos st_tags para rellenar valores en _on_campo_changed
        self._st_tags = st_tags

        # --- Toolbar ---
        tb = QTDialogs.LCTB(self)
        tb.new(_("Accept"), Iconos.Aceptar(), self.aceptar)
        tb.new(_("Cancel"), Iconos.Cancelar(), self.reject)
        tb.new(_("Reinit"), Iconos.Reiniciar(), self.reiniciar)

        layout = Colocacion.V().control(tb).espacio(6).otro(ly).margen(6)
        self.setLayout(layout)

        self.restore_video(with_tam=False)
        self._li_c[0][1].setFocus()

        for w in (lb_col, lb_con, lb_val, lb_uni):
            w.setFocusPolicy(QtCore.Qt.FocusPolicy.NoFocus)

    def _on_campo_changed(self, row):
        """Al cambiar el campo, rellenar el combo de valor con los valores únicos."""
        __, c_campo, __, c_valor = self._li_c[row]
        tag = c_campo.valor()
        if tag and tag in self._st_tags:
            vals = list(self._st_tags[tag])
            li_options = [("", "")] + [(v, v) for v in vals]
            c_valor.rehacer(li_options, "")
            c_valor.setCurrentText("")
            c_valor.setToolTip("\n".join(v for v in vals[:20]) + ("\n..." if len(vals) > 20 else ""))
        else:
            c_valor.rehacer([], "")
            c_valor.setCurrentText("")
            c_valor.setToolTip("")

    def reiniciar(self):
        for i in range(self.NUM_ROWS):
            c_union, c_campo, c_condicion, c_valor = self._li_c[i]
            if c_union:
                c_union.setCurrentIndex(0)
            c_campo.setCurrentIndex(0)
            c_condicion.setCurrentIndex(0)
            c_valor.setCurrentText("")
            c_valor.rehacer([], "")

    def lee_filtro_actual(self):
        self.li_filter = []
        for i in range(self.NUM_ROWS):
            c_union, c_campo, c_condicion, c_valor = self._li_c[i]
            union = c_union.valor() if c_union else None
            campo = c_campo.valor()
            condicion = c_condicion.valor()
            valor = c_valor.currentText().strip()
            if campo and condicion:
                self.li_filter.append([union, campo, condicion, valor])
        return True

    def aceptar(self):
        if self.lee_filtro_actual():
            self.save_video()
            self.accept()
