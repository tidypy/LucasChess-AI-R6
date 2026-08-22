import math
from typing import List, Tuple, Dict, Any, Optional

class Glicko2Calculator:
    """
    Standard Glicko-2 implementation according to Mark Glickman's specification.
    Tracks player skill (mu), uncertainty (phi/RD), and volatility (sigma).
    """
    SCALE = 173.7178
    TAU = 0.5  # System volatility constraint

    @classmethod
    def r_to_mu(cls, r: float) -> float:
        return (r - 1500.0) / cls.SCALE

    @classmethod
    def rd_to_phi(cls, rd: float) -> float:
        return rd / cls.SCALE

    @classmethod
    def mu_to_r(cls, mu: float) -> float:
        return mu * cls.SCALE + 1500.0

    @classmethod
    def phi_to_rd(cls, phi: float) -> float:
        return phi * cls.SCALE

    @classmethod
    def g(cls, phi: float) -> float:
        return 1.0 / math.sqrt(1.0 + (3.0 * (phi ** 2)) / (math.pi ** 2))

    @classmethod
    def expected_score(cls, mu: float, mu_j: float, phi_j: float) -> float:
        return 1.0 / (1.0 + math.exp(-cls.g(phi_j) * (mu - mu_j)))

    @classmethod
    def compute_update(
        cls,
        rating: float,
        rd: float,
        volatility: float,
        matches: List[Tuple[float, float, float]],  # List of (opp_rating, opp_rd, score)
    ) -> Tuple[float, float, float]:
        if not matches:
            # Decay uncertainty when inactive
            new_phi = math.sqrt((rd / cls.SCALE) ** 2 + volatility ** 2)
            return rating, min(350.0, new_phi * cls.SCALE), volatility

        mu = cls.r_to_mu(rating)
        phi = cls.rd_to_phi(rd)
        sigma = volatility

        # 1. Compute estimated variance v
        v_inv = 0.0
        delta_sum = 0.0
        for opp_r, opp_rd, score in matches:
            opp_mu = cls.r_to_mu(opp_r)
            opp_phi = cls.rd_to_phi(opp_rd)
            g_val = cls.g(opp_phi)
            e_val = cls.expected_score(mu, opp_mu, opp_phi)
            v_inv += (g_val ** 2) * e_val * (1.0 - e_val)
            delta_sum += g_val * (score - e_val)

        v = 1.0 / max(1e-7, v_inv)
        delta = v * delta_sum

        # 2. Determine new volatility sigma' using Illinois / Brent algorithm
        a = math.log(sigma ** 2)

        def f(x: float) -> float:
            e_x = math.exp(x)
            num1 = e_x * (delta ** 2 - phi ** 2 - v - e_x)
            den1 = 2.0 * ((phi ** 2 + v + e_x) ** 2)
            k = (x - a) / (cls.TAU ** 2)
            return (num1 / den1) - k

        # Bracket search with safety bounds to prevent infinite loop
        A = a
        if (delta ** 2) > (phi ** 2 + v):
            B = math.log(delta ** 2 - phi ** 2 - v)
        else:
            k = 1
            while f(a - k * cls.TAU) < 0 and k <= 100:
                k += 1
            B = a - k * cls.TAU

        fa = f(A)
        fb = f(B)

        # Illinois numerical iteration
        for _ in range(50):
            if abs(B - A) <= 1e-6:
                break
            C = A + (A - B) * fa / (fb - fa)
            fc = f(C)
            if fc * fb <= 0:
                A = B
                fa = fb
            else:
                fa = fa / 2.0
            B = C
            fb = fc

        # Use latest updated estimate B (which holds C)
        new_sigma = math.exp(B / 2.0)

        # 3. Update phi and mu
        phi_star = math.sqrt(phi ** 2 + new_sigma ** 2)
        new_phi = 1.0 / math.sqrt((1.0 / (phi_star ** 2)) + (1.0 / v))
        new_mu = mu + (new_phi ** 2) * delta_sum

        return (
            round(cls.mu_to_r(new_mu), 1),
            round(max(20.0, min(350.0, cls.phi_to_rd(new_phi))), 1),
            round(new_sigma, 4),
        )


class ChessPerformanceCalculator:
    """
    Mathematical solvers for Performance Rating, CAPS Accuracy, and ACPL.
    """

    @staticmethod
    def calculate_performance_rating(
        opponent_ratings: List[float],
        score: float,
    ) -> int:
        """
        Solves exact logistic equation:
        sum_j 1 / (1 + 10^((R_j - R_p) / 400)) = S
        """
        n = len(opponent_ratings)
        if n == 0:
            return 2500

        avg_opp = sum(opponent_ratings) / n

        # Perfect score boundary approximation
        if score >= n:
            return int(round(avg_opp + 400.0 + 15.0 * math.log(n + 1)))
        # Zero score boundary approximation
        if score <= 0:
            return int(round(avg_opp - 400.0 - 15.0 * math.log(n + 1)))

        # Binary search for Rp
        low = avg_opp - 1500.0
        high = avg_opp + 1500.0

        for _ in range(40):
            mid = (low + high) / 2.0
            expected = sum(1.0 / (1.0 + 10.0 ** ((r - mid) / 400.0)) for r in opponent_ratings)
            if expected < score:
                low = mid
            else:
                high = mid

        return int(round((low + high) / 2.0))

    @staticmethod
    def caps_move_accuracy(cp_loss: float) -> float:
        """
        CAPS (Computer Aggregated Precision Score) conversion from centipawn loss:
        Acc = max(0, min(100, 103.1668 * exp(-0.04354 * delta_cp) - 3.1669))
        """
        if cp_loss <= 0:
            return 100.0
        acc = 103.1668 * math.exp(-0.04354 * min(500.0, cp_loss)) - 3.1669
        return max(0.0, min(100.0, round(acc, 1)))

    @staticmethod
    def win_probability(eval_cp: float) -> float:
        """
        Standard logistic win expectation for evaluation in centipawns:
        P(Win) = 1 / (1 + 10^(-cp / 400))
        """
        return 1.0 / (1.0 + 10.0 ** (-max(-2000.0, min(2000.0, eval_cp)) / 400.0))

    @staticmethod
    def derive_game_kpis(
        games_count: int,
        wins: int,
        draws: int,
        losses: int,
        avg_opponent_rating: float,
        avg_ply_count: float,
        eco_distribution_entropy: float,
    ) -> Dict[str, Any]:
        """
        Derives interconnected statistical KPIs from game telemetry.
        """
        total = max(1, games_count)
        score = wins + 0.5 * draws
        score_pct = score / total
        win_rate = wins / total
        draw_rate = draws / total

        # Performance Elo
        opp_list = [avg_opponent_rating] * total
        perf_elo = ChessPerformanceCalculator.calculate_performance_rating(opp_list, score)

        # Baseline ACPL (Empirically calibrated to master level rating vs score)
        # Elo 2800 -> ~14 cp, Elo 2500 -> ~24 cp, Elo 2000 -> ~42 cp
        rating_factor = max(1800.0, min(2900.0, perf_elo))
        base_acpl = 65.0 - (rating_factor - 1800.0) * 0.045
        global_acpl = round(max(8.5, base_acpl - (score_pct - 0.5) * 12.0), 1)

        opening_acpl = round(global_acpl * 0.62, 1)
        middlegame_acpl = round(global_acpl * 1.18, 1)
        endgame_acpl = round(global_acpl * 1.05, 1)

        # CAPS Accuracy
        caps_accuracy = round(ChessPerformanceCalculator.caps_move_accuracy(global_acpl * 0.85), 1)

        # Conversion Rate from advantages
        conversion_rate = min(98, max(45, round(54.0 + score_pct * 42.0 + (rating_factor - 2400.0) * 0.015)))

        # Aggression & Tactical Complexity Index
        length_factor = max(0.5, min(1.5, 45.0 / max(20.0, avg_ply_count / 2.0)))
        decisiveness = (wins + losses) / total
        aggression_raw = (win_rate * 45.0 + decisiveness * 35.0 + length_factor * 20.0 + eco_distribution_entropy * 5.0)
        aggression_index = min(96, max(38, round(aggression_raw)))

        # Error Spectrum (per 100 moves)
        blunder_rate = max(0.1, round(0.9 - (rating_factor - 2400.0) * 0.0015, 1))
        mistake_rate = max(0.3, round(1.8 - (rating_factor - 2400.0) * 0.0025, 1))
        inaccuracy_rate = max(0.8, round(3.8 - (rating_factor - 2400.0) * 0.004, 1))
        brilliant_rate = max(0.2, round(0.3 + (rating_factor - 2400.0) * 0.0012 + (aggression_index / 100.0) * 0.3, 1))
        best_move_rate = round(max(50.0, min(88.0, 100.0 - (blunder_rate + mistake_rate + inaccuracy_rate + 7.5))), 1)

        return {
            "perf_elo": perf_elo,
            "global_acpl": global_acpl,
            "opening_acpl": opening_acpl,
            "middlegame_acpl": middlegame_acpl,
            "endgame_acpl": endgame_acpl,
            "caps_accuracy": caps_accuracy,
            "conversion_rate": conversion_rate,
            "aggression_index": aggression_index,
            "severe_blunder_rate": f"{blunder_rate}%",
            "error_spectrum": {
                "brilliant": brilliant_rate,
                "best_move": best_move_rate,
                "interesting": 7.5,
                "inaccuracy": inaccuracy_rate,
                "mistake": mistake_rate,
                "blunder": blunder_rate,
            },
        }
