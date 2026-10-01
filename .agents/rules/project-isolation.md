# Project-Level Skills Scope & Isolation Policy

## Strict Scope Constraint
1. **Local-Only Boundary**: All agent skills, runbooks, and configurations for this project MUST reside and be loaded strictly from within this workspace root: `./.agents/skills/` (located at `d:\My project webapp\manga\.agents\skills/`).
2. **Zero Global Modification**: Never attempt to install, clone, register, or modify skills, configs, or rules in global or system directories (such as `~/.antigravity`, `~/.gemini`, or the user's Home directory).
3. **Dedicated Configuration**: All discovery and skill dispatching are handled via `./.agents/skills.json`, `./GEMINI.md`, `./AGENTS.md`, and `./.agents/rules/`.
4. **Reproducibility**: Keeping skills self-contained inside `./.agents/skills/` ensures the project is completely portable, version-controlled, and does not leak or conflict with global configurations.
