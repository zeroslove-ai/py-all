# CSA-only branch

- Branch: `feature/csa-only`
- Preserved baseline: `archive/pre-csa-only` (`3e9716dd6c424dff8f850102eed76884d4e907fa`)
- The sole app-managed gameplay effect is spatial common-sense alteration (CSA).
- CSA is created, updated, and deactivated only by a signed structured app action.
- Level unlocks: Lv.1–2 weak/ward/2, Lv.3 medium/ward/3, Lv.4 medium/floor/3, Lv.5–6 strong/floor/4, Lv.7–9 strong/building/4, Lv.10 strong/world/5. Location scope is available from Lv.1.
- Current location scope uses a server-derived ID from the exact world-state building, floor, ward, and location label.
- CSA expiration or deactivation stops the current norm only; it does not rewrite memories or physical scene state.
- Legacy mental-effect save keys are **LEGACY STORAGE ONLY — CSA-only 모드에서는 숨김·주입·표시·갱신하지 않음**.
- No database migration is required.
