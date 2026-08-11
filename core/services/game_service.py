from core.persistence.database import GameRepository

class GameService:
    """
    Business logic layer for games.
    Abstracts the persistence layer so the API doesn't care where data comes from.
    """
    def __init__(self, repository: GameRepository):
        self.repo = repository

    def get_game(self, game_id: int) -> dict:
        """
        Retrieves a game and handles any domain-level transformations required.
        """
        game = self.repo.get_game_by_rowid(game_id)
        if not game:
            return None
        return game
