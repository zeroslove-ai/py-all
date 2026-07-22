# Rulebook update — 2026-07-22

Applied to game `9ed5b835-9948-4cad-ac25-3ebff7348574`.

Before: the display rulebook required four body sections, a body mind monitor, and a turn number; the verification rulebook repeated those checks; the opening pre-assigned the player as a doctor; the game-system text contained first-impression and success formulas.

After: the body is limited to narrative/action, player status, and choices; mind monitor is Extract/sidebar-only with the `surface`, `inner`, and `physical_reaction` contract; the body omits turn numbers; player creation is a complete recommendation instead of a pre-assigned role; and formulaic first-impression/success rules are removed in favour of narrative judgment plus Worker-owned limits.

The current DB change was made directly to `game_master.data` after recording the previous values through a read query. Remaining Extract and UI/E2E work is tracked in the follow-up implementation batch.
