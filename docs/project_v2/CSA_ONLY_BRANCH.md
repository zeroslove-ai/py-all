# CSA-only branch

- Branch: `feature/csa-only`
- Preserved base SHA: `3e9716dd6c424dff8f850102eed76884d4e907fa`
- Archive branch: `archive/pre-csa-only`
- The only app-managed mental effect is spatial common-sense change (CSA).
- Personal suggestion and hypnosis mechanics are not exposed by the UI, injected into Story or Extract prompts, accepted by app validation, or updated during commits.
- NPC relationship stats exposed and updated by this branch are limited to affinity and trust.
- Existing legacy save fields such as active suggestions and hypnosis-related NPC stats remain in storage for compatibility, but this branch removes them from runtime context and public payloads.
- The frontend app is reduced to CSA creation, update, deactivation, status, map, and NPC navigation.
- Story uses a compact CSA-only runtime contract and never injects the legacy mixed app usage text from game master data.
- Extract uses a CSA-only memory firewall and excludes hypnosis-onset image candidates.
- CSA deactivation preserves event memory and physical scene state.
- No database migration is required.
- Static checks passed for the Worker, sidebar, and CSA app client. Gameplay tests were not run.
- This branch is not deployed automatically.
