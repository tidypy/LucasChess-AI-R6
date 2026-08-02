import math
import numpy as np


class SigmoidELOCalculator:
    """
    Depth-aware Sigmoid ELO Calculator with non-book filtering,
    phase weighting (Opening, Middlegame, Endgame), and outlier trimming.
    """

    @staticmethod
    def calculate_sigmoid_elo(accuracy_pct: float) -> int:
        """
        Calculates depth-aware Sigmoid ELO:
        ELO = 800 + (2000 / (1 + exp(-0.08 * (Accuracy - 72))))
        """
        if accuracy_pct is None:
            return 800
        # Clamp accuracy between 0 and 100
        acc = max(0.0, min(100.0, float(accuracy_pct)))
        elo = 800.0 + (2000.0 / (1.0 + math.exp(-0.08 * (acc - 72.0))))
        return int(round(elo))

    @staticmethod
    def calculate_trimmed_mean(values: list, trim_ratio: float = 0.10) -> float:
        """
        Calculates trimmed mean (removing top/bottom outliers) to prevent
        single tactical blowouts or short draws from skewing player rating.
        """
        if not values:
            return 0.0
        arr = np.array(values, dtype=float)
        if len(arr) < 4:
            return float(np.mean(arr))
        
        n_trim = int(len(arr) * trim_ratio)
        if n_trim > 0:
            arr_sorted = np.sort(arr)
            arr_trimmed = arr_sorted[n_trim:-n_trim]
            if len(arr_trimmed) > 0:
                return float(np.mean(arr_trimmed))
        return float(np.mean(arr))

    @classmethod
    def calculate_game_metrics(cls, game_obj, is_white: bool):
        """
        Calculates non-book accuracy, ACPL, phase breakdown (Opening, Middlegame, Endgame),
        and error spectrum for a single game.
        """
        moves = getattr(game_obj, "li_moves", [])
        if not moves:
            return None

        non_book_acpl = []
        phase_acpl = {"opening": [], "middlegame": [], "endgame": []}
        error_spectrum = {
            "brilliant": 0,    # !!
            "good": 0,         # !
            "interesting": 0,  # !?
            "acceptable": 0,
            "dubious": 0,      # ?!
            "mistakes": 0,     # ?
            "blunders": 0,     # ??
        }

        total_moves = len(moves)
        book_count = 0

        for idx, move in enumerate(moves):
            # Check if move belongs to analyzed side
            move_is_white = (idx % 2 == 0)
            if move_is_white != is_white:
                continue

            # Exclude opening book moves
            is_book = getattr(move, "is_book", False) or getattr(move, "in_book", False)
            if is_book:
                book_count += 1
                continue

            lost = getattr(move, "get_points_lost", lambda: None)()
            if lost is None:
                continue

            lost_cp = min(float(lost), 2000.0)
            non_book_acpl.append(lost_cp)

            # Assign phase (Opening: first 10-12 plies, Middlegame: plies 12-40, Endgame: plies 40+)
            if idx < 12:
                phase_acpl["opening"].append(lost_cp)
            elif idx < 40:
                phase_acpl["middlegame"].append(lost_cp)
            else:
                phase_acpl["endgame"].append(lost_cp)

            # Classify error spectrum
            if lost_cp <= 10:
                error_spectrum["good"] += 1
            elif lost_cp <= 25:
                error_spectrum["acceptable"] += 1
            elif lost_cp <= 50:
                error_spectrum["interesting"] += 1
            elif lost_cp <= 100:
                error_spectrum["dubious"] += 1
            elif lost_cp <= 200:
                error_spectrum["mistakes"] += 1
            else:
                error_spectrum["blunders"] += 1

            # Check brilliant tag
            if getattr(move, "is_brilliant", False):
                error_spectrum["brilliant"] += 1

        if not non_book_acpl:
            return None

        avg_acpl = float(np.mean(non_book_acpl))
        # Accuracy formula from ACPL: Acc = max(0, 100 - (ACPL / 2))
        accuracy_pct = max(0.0, min(100.0, 103.0 - 0.4 * math.sqrt(avg_acpl) - 0.05 * avg_acpl))

        return {
            "acpl": avg_acpl,
            "accuracy": accuracy_pct,
            "sigmoid_elo": cls.calculate_sigmoid_elo(accuracy_pct),
            "book_moves_excluded": book_count,
            "phase_acpl": {
                "opening": float(np.mean(phase_acpl["opening"])) if phase_acpl["opening"] else 0.0,
                "middlegame": float(np.mean(phase_acpl["middlegame"])) if phase_acpl["middlegame"] else 0.0,
                "endgame": float(np.mean(phase_acpl["endgame"])) if phase_acpl["endgame"] else 0.0,
            },
            "error_spectrum": error_spectrum,
        }


class Glicko2Calculator:
    """
    Glicko-2 rating system implementation for multi-game rating estimation.
    """
    TAU = 0.5  # System constant governing volatility constraint

    def __init__(self, rating=1500.0, rd=350.0, vol=0.06):
        self.r = rating
        self.rd = rd
        self.vol = vol

    def update(self, opponent_ratings, opponent_rds, results):
        """
        Updates rating based on a series of matches against opponents.
        """
        if not results:
            return self.r, self.rd, self.vol

        # Convert to Glicko-2 scale
        mu = (self.r - 1500.0) / 173.7178
        phi = self.rd / 173.7178

        v_inv = 0.0
        delta_sum = 0.0

        for opp_r, opp_rd, outcome in zip(opponent_ratings, opponent_rds, results):
            opp_mu = (opp_r - 1500.0) / 173.7178
            opp_phi = opp_rd / 173.7178

            g = 1.0 / math.sqrt(1.0 + 3.0 * (opp_phi ** 2) / (math.pi ** 2))
            E = 1.0 / (1.0 + math.exp(-g * (mu - opp_mu)))

            v_inv += (g ** 2) * E * (1.0 - E)
            delta_sum += g * (outcome - E)

        if v_inv == 0:
            return self.r, self.rd, self.vol

        v = 1.0 / v_inv
        delta = v * delta_sum

        # Update volatility (iterative algorithm)
        a = math.log(self.vol ** 2)
        x0 = a
        for _ in range(20):
            d2 = delta ** 2
            p2 = phi ** 2
            ev = math.exp(x0)
            h1 = p2 + v + ev
            f_x = (ev * (d2 - p2 - v - ev) / (2.0 * (h1 ** 2))) - ((x0 - a) / (self.TAU ** 2))
            df_x = (ev * (p2 + v + ev) * (d2 - p2 - v - ev) / (2.0 * (h1 ** 3))) - (1.0 / (self.TAU ** 2))
            if abs(df_x) < 1e-12:
                break
            x1 = x0 - f_x / df_x
            if abs(x1 - x0) < 1e-6:
                break
            x0 = x1

        new_vol = math.exp(x0 / 2.0)

        # Update rating deviation and rating
        phi_star = math.sqrt(phi ** 2 + new_vol ** 2)
        new_phi = 1.0 / math.sqrt(1.0 / (phi_star ** 2) + 1.0 / v)
        new_mu = mu + (new_phi ** 2) * delta_sum

        self.r = round(173.7178 * new_mu + 1500.0)
        self.rd = round(173.7178 * new_phi)
        self.vol = new_vol

        return self.r, self.rd, self.vol


class WDLConverter:
    """
    Parses Stockfish UCI_ShowWDL or converts centipawn evaluation to win/draw/loss probabilities.
    """

    @staticmethod
    def cp_to_win_prob(cp: float) -> float:
        """
        Converts centipawns to win probability via logistic formula:
        P(W) = 1 / (1 + 10^(-CP / 400))
        """
        if cp is None:
            return 0.5
        return 1.0 / (1.0 + math.pow(10.0, -float(cp) / 400.0))

    @staticmethod
    def parse_uci_wdl(wdl_str: str):
        """
        Parses Stockfish UCI_ShowWDL output e.g. "500 400 100" (out of 1000)
        into win, draw, loss probabilities (0.0 to 1.0).
        """
        if not wdl_str:
            return None
        try:
            parts = [float(x) for x in wdl_str.strip().split() if x.strip()]
            if len(parts) == 3:
                total = sum(parts)
                if total > 0:
                    return {
                        "win": parts[0] / total,
                        "draw": parts[1] / total,
                        "loss": parts[2] / total,
                    }
        except Exception:
            pass
        return None
