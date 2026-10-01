# Project Agent Guidelines (manga)

This file configures agent behaviors, rules, and skills for `D:\MyProject\manga`.

## 1. Project-Only Scope Constraint
- All operations, skills, and configuration files MUST be read strictly from this project workspace.
- Never modify or rely on global configurations (`~/.antigravity` or home directory).
- Skills are stored in `./.agents/skills/` and registered via `./.agents/skills.json`.

## 2. Core Protocols & Guidelines
- **Operating Rules**: Adhere strictly to the Aileron Protocol (`.agents/skills/aileron-protocol/Aileron/GEMINI.md`) for adaptive ceremony, safe minimal edits, systematic debugging, and verified completions.
- **Engineering Principles**: Follow Andrej Karpathy's guidelines (`.agents/skills/andrej-karpathy-skills/skills/karpathy-guidelines/SKILL.md`) for thinking before coding, simplicity, and surgical changes.

## 3. Auto-Skill Dispatching
Refer to `./.agents/rules/auto-skills-dispatcher.md` and `./GEMINI.md` for the complete trigger mapping. When a user prompt matches a domain (planning, debugging, TDD, code review, UI/UX, or styling), automatically inspect and follow the matching skill under `./.agents/skills/`.
