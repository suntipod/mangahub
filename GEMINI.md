# Project Agent Rules & Skills Configuration (manga)

<scope>
- **Project Boundary**: All agent skills, runbooks, and configurations are strictly isolated within this project directory (`D:\MyProject\manga`).
- **Forbidden**: Do NOT read, install, or edit any files in global/system directories (`~/.antigravity`, `~/.gemini`, or user Home directory).
- **Skills Source**: All skills MUST be read from `./.agents/skills/` using the local paths configured in `./.agents/skills.json` and `./.agents/rules/auto-skills-dispatcher.md`.
</scope>

---

## 1. Operating Protocol (Aileron Core)

- **Turn Contract**:
  - Read-only queries (explain, search, audit, compare): strictly avoid proactive file edits.
  - Edit requests (write, add, fix, refactor, implement): proceed with narrow, targeted edits.
- **Adaptive Ceremony**:
  - For straightforward edits (bug fixes, small UI adjustments, single tests): decide internally and execute immediately. Do NOT create heavy plans (`walkthrough.md`, `task.md`, or multi-page plans).
  - For systemic architectural changes, major database migrations, or public API redesigns: write a concise, actionable plan.
- **Codebase-First**:
  - Inspect existing project code, patterns, styles, and configurations before introducing new abstractions or packages.
  - Never add new dependencies without explicit user request or confirmation.
- **Editing Safety**:
  - Perform surgical edits only. Never wipe unrelated comments, reformat entire files unnecessarily, or modify unrequested modules.
  - Revert failed attempts before trying alternative solutions; do not stack speculative fixes on broken code.
- **Debugging Discipline**:
  - Systematic loop: Reproduce -> Locate -> Formulate Hypothesis -> Test -> Fix -> Verify.
  - Stop and report if 2 consecutive attempts fail on the exact same error.
- **Verification Discipline**:
  - Always verify code by running tests, typechecks, or builds before marking a task complete.
  - Separate claims into Verified, Inferred, and Unchecked. Never claim success without evidence.

---

## 2. Engineering Guidelines (Karpathy Principles)

1. **Think Before Coding**: Thoroughly inspect target code and understand requirements before writing the first line.
2. **Simplicity First**: Write the simplest code that solves the problem. Avoid premature generalization or over-engineering.
3. **Surgical Changes**: Make minimal, precise modifications. Avoid touching lines that do not need to change.
4. **Goal-Driven Execution**: Keep each iteration focused on making measurable progress toward the user's explicit objective.

---

## 3. Automatic Skills Dispatcher (Auto-Trigger)

Before starting work, check if the request matches any of the specialized skills stored in `./.agents/skills/`. When matched, automatically view and apply the designated `SKILL.md`:

### A. Planning, Spec & Architecture
- **Creative / New Feature Brainstorming**: `.agents/skills/superpowers/skills/brainstorming/SKILL.md`
- **Multi-Step Plan Decomposition**: `.agents/skills/superpowers/skills/writing-plans/SKILL.md`
- **Translating Ideas to Spec**: `.agents/skills/mattpocock-skills/skills/engineering/to-spec/SKILL.md`
- **Feature to Tickets**: `.agents/skills/mattpocock-skills/skills/engineering/to-tickets/SKILL.md`
- **Domain Modeling**: `.agents/skills/mattpocock-skills/skills/engineering/domain-modeling/SKILL.md`
- **Architecture Improvement**: `.agents/skills/mattpocock-skills/skills/engineering/improve-codebase-architecture/SKILL.md`
- **Eliminating Over-Engineering**: `.agents/skills/ponytail/skills/ponytail-review/SKILL.md`

### B. Implementation, TDD & Execution
- **Core Coding Standards**: `.agents/skills/andrej-karpathy-skills/skills/karpathy-guidelines/SKILL.md`
- **Test-Driven Development (TDD)**: `.agents/skills/superpowers/skills/test-driven-development/SKILL.md`
- **Executing Plans**: `.agents/skills/superpowers/skills/executing-plans/SKILL.md`
- **Surgical Edits**: `.agents/skills/caveman/skills/surgical-patch/SKILL.md`
- **Parallel Subagent Tasks**: `.agents/skills/superpowers/skills/subagent-driven-development/SKILL.md`

### C. Debugging & Troubleshooting
- **Systematic Debugging Workflow**: `.agents/skills/superpowers/skills/systematic-debugging/SKILL.md`
- **9ARM Debug Mantra**: `.agents/skills/9arm-skills/skills/engineering/debug-mantra/SKILL.md`
- **Bug Diagnosis**: `.agents/skills/mattpocock-skills/skills/engineering/diagnosing-bugs/SKILL.md`
- **Post-Mortem & Incident Analysis**: `.agents/skills/9arm-skills/skills/engineering/post-mortem/SKILL.md`

### D. Verification, Review & Git
- **Verification Before Completion**: `.agents/skills/superpowers/skills/verification-before-completion/SKILL.md`
- **Minimalist Verify & Stop**: `.agents/skills/caveman/skills/verify-and-stop/SKILL.md`
- **Code Scrutiny**: `.agents/skills/9arm-skills/skills/engineering/scrutinize/SKILL.md`
- **Requesting / Receiving Code Review**: `.agents/skills/superpowers/skills/requesting-code-review/SKILL.md`
- **Clean Git Commits**: `.agents/skills/caveman/skills/caveman-commit/SKILL.md`

### E. Frontend, UI/UX & Design
- **UI/UX Intelligence (Web, Mobile, Stacks)**: `.agents/skills/ui-ux-pro-max-skill/.claude/skills/ui-ux-pro-max/SKILL.md`
- **Design System & Tokens**: `.agents/skills/ui-ux-pro-max-skill/.claude/skills/design-system/SKILL.md`
- **Tailwind & shadcn/ui Styling**: `.agents/skills/ui-ux-pro-max-skill/.claude/skills/ui-styling/SKILL.md`
- **Anti-Slop Web & Landing Pages**: `.agents/skills/taste-skill/skills/taste-skill/SKILL.md`
- **High-End Typography & Spacing**: `.agents/skills/taste-skill/skills/soft-skill/SKILL.md`
- **Redesigning Existing UI**: `.agents/skills/taste-skill/skills/redesign-skill/SKILL.md`
- **Impeccable Frontend Craft**: `.agents/skills/impeccable/.gemini/skills/impeccable/SKILL.md`
- **Banners & Visual Assets**: `.agents/skills/ui-ux-pro-max-skill/.claude/skills/banner-design/SKILL.md`
- **HTML Slide Presentations**: `.agents/skills/ui-ux-pro-max-skill/.claude/skills/slides/SKILL.md`

### F. Collaboration & Communication
- **Clarification / Interactive Interview**: `.agents/skills/mattpocock-skills/skills/productivity/grill-me/SKILL.md`
- **Executive & Non-Technical Communication**: `.agents/skills/9arm-skills/skills/productivity/management-talk/SKILL.md`
