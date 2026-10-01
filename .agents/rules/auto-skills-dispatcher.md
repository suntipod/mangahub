# Automatic Skills Dispatcher & Execution Rules

When handling tasks in this repository, the agent MUST automatically identify user intent and task requirements, then consult and follow the corresponding skill files in `./.agents/skills/` before executing.

---

## 1. Planning, Architecture & Requirements
| Condition / Trigger | Auto-Activated Skill | Path |
| :--- | :--- | :--- |
| Brainstorming features, exploring product ideas, creative phase | `brainstorming` | `.agents/skills/superpowers/skills/brainstorming/SKILL.md` |
| Multi-step implementation planning, complex spec decomposition | `writing-plans` | `.agents/skills/superpowers/skills/writing-plans/SKILL.md` |
| Translating informal user requests to technical specification | `to-spec` | `.agents/skills/mattpocock-skills/skills/engineering/to-spec/SKILL.md` |
| Breaking features into actionable tickets or subtasks | `to-tickets` | `.agents/skills/mattpocock-skills/skills/engineering/to-tickets/SKILL.md` |
| Designing domain models, state machines, business entities | `domain-modeling` | `.agents/skills/mattpocock-skills/skills/engineering/domain-modeling/SKILL.md` |
| Refactoring complex architecture, decoupling modules | `improve-codebase-architecture` | `.agents/skills/mattpocock-skills/skills/engineering/improve-codebase-architecture/SKILL.md` |
| Detecting & eliminating over-engineering, unnecessary abstractions | `ponytail-review` | `.agents/skills/ponytail/skills/ponytail-review/SKILL.md` |
| Tech debt audit and complexity reduction | `ponytail-audit` | `.agents/skills/ponytail/skills/ponytail-audit/SKILL.md` |

---

## 2. Implementation, Coding & Simplicity
| Condition / Trigger | Auto-Activated Skill | Path |
| :--- | :--- | :--- |
| Coding guidelines: Think before coding, simplicity first, surgical edits | `karpathy-guidelines` | `.agents/skills/andrej-karpathy-skills/skills/karpathy-guidelines/SKILL.md` |
| Test-Driven Development (TDD: Red-Green-Refactor) | `test-driven-development` | `.agents/skills/superpowers/skills/test-driven-development/SKILL.md` |
| Executing implementation plans systematically | `executing-plans` | `.agents/skills/superpowers/skills/executing-plans/SKILL.md` |
| Multi-agent parallel task execution | `subagent-driven-development` | `.agents/skills/superpowers/skills/subagent-driven-development/SKILL.md` |
| Implementing features with strict verification | `implement` | `.agents/skills/mattpocock-skills/skills/engineering/implement/SKILL.md` |
| Surgical minimal edits without bloat | `surgical-patch` | `.agents/skills/caveman/skills/surgical-patch/SKILL.md` |
| Rapid prototyping and proof-of-concept | `prototype` | `.agents/skills/mattpocock-skills/skills/engineering/prototype/SKILL.md` |

---

## 3. Debugging, Troubleshooting & Incidents
| Condition / Trigger | Auto-Activated Skill | Path |
| :--- | :--- | :--- |
| Bug encountered, test failed, unexpected error occurred | `systematic-debugging` | `.agents/skills/superpowers/skills/systematic-debugging/SKILL.md` |
| 9ARM engineering debugging mantra & mindset | `debug-mantra` | `.agents/skills/9arm-skills/skills/engineering/debug-mantra/SKILL.md` |
| Root cause analysis & bug diagnosis | `diagnosing-bugs` | `.agents/skills/mattpocock-skills/skills/engineering/diagnosing-bugs/SKILL.md` |
| Post-incident review, failure post-mortem report | `post-mortem` | `.agents/skills/9arm-skills/skills/engineering/post-mortem/SKILL.md` |

---

## 4. Code Review, Verification & Git
| Condition / Trigger | Auto-Activated Skill | Path |
| :--- | :--- | :--- |
| Strict verification before marking task complete | `verification-before-completion` | `.agents/skills/superpowers/skills/verification-before-completion/SKILL.md` |
| Minimalist verification and safe stopping | `verify-and-stop` | `.agents/skills/caveman/skills/verify-and-stop/SKILL.md` |
| Thorough code scrutinization and defect discovery | `scrutinize` | `.agents/skills/9arm-skills/skills/engineering/scrutinize/SKILL.md` |
| Code review feedback handling & implementation | `receiving-code-review` | `.agents/skills/superpowers/skills/receiving-code-review/SKILL.md` |
| Pre-merge code review request and diff inspection | `requesting-code-review` | `.agents/skills/superpowers/skills/requesting-code-review/SKILL.md` |
| Creating clean, concise, atomic git commit messages | `caveman-commit` | `.agents/skills/caveman/skills/caveman-commit/SKILL.md` |
| Finishing branch & PR preparation | `finishing-a-development-branch` | `.agents/skills/superpowers/skills/finishing-a-development-branch/SKILL.md` |

---

## 5. UI/UX, Design, Styling & Frontend
| Condition / Trigger | Auto-Activated Skill | Path |
| :--- | :--- | :--- |
| UI/UX design intelligence (layouts, palettes, fonts, UX guidelines) | `ui-ux-pro-max` | `.agents/skills/ui-ux-pro-max-skill/.claude/skills/ui-ux-pro-max/SKILL.md` |
| Design system creation, token architecture (primitive/semantic/component) | `design-system` | `.agents/skills/ui-ux-pro-max-skill/.claude/skills/design-system/SKILL.md` |
| Component styling with Tailwind CSS & shadcn/ui | `ui-styling` | `.agents/skills/ui-ux-pro-max-skill/.claude/skills/ui-styling/SKILL.md` |
| Promotional banners, hero sections, social assets | `banner-design` | `.agents/skills/ui-ux-pro-max-skill/.claude/skills/banner-design/SKILL.md` |
| HTML presentation slides with Chart.js | `slides` | `.agents/skills/ui-ux-pro-max-skill/.claude/skills/slides/SKILL.md` |
| Anti-slop frontend craft, landing pages, and redesigns | `design-taste-frontend` | `.agents/skills/taste-skill/skills/taste-skill/SKILL.md` |
| High-end agency visual design, typography, spacing, shadows | `high-end-visual-design` | `.agents/skills/taste-skill/skills/soft-skill/SKILL.md` |
| Upgrading existing interfaces without breaking functionality | `redesign-existing-projects` | `.agents/skills/taste-skill/skills/redesign-skill/SKILL.md` |
| Industrial, brutalist, high-contrast mechanical UI | `industrial-brutalist-ui` | `.agents/skills/taste-skill/skills/brutalist-skill/SKILL.md` |
| Impeccable frontend craft, UI polish, micro-interactions | `impeccable` | `.agents/skills/impeccable/.gemini/skills/impeccable/SKILL.md` |

---

## 6. Protocols & Communication
| Condition / Trigger | Auto-Activated Skill | Path |
| :--- | :--- | :--- |
| Core operating discipline for Antigravity 2.0 | `aileron-protocol` | `.agents/skills/aileron-protocol/Aileron/GEMINI.md` |
| Clarifying requirements through interactive interview | `grill-me` | `.agents/skills/mattpocock-skills/skills/productivity/grill-me/SKILL.md` |
| Communicating with executives, managers, non-technical stakeholders | `management-talk` | `.agents/skills/9arm-skills/skills/productivity/management-talk/SKILL.md` |
| Fast decision analysis for uncertain options | `qwenchance` | `.agents/skills/9arm-skills/skills/productivity/qwenchance/SKILL.md` |

---

## Auto-Execution Procedure
1. When receiving a prompt, scan the above table for matching triggers.
2. If matched, immediately read the designated `SKILL.md` file using `view_file`.
3. Follow the procedures and constraints specified in that skill strictly.
4. If multiple skills match (e.g. implementing UI via TDD), combine their best practices: use TDD workflow with UI/UX styling rules.
