# Multi-Agent Workflow Guidelines for Methik

## Mandatory Step-by-Step Protocol

Every development step MUST strictly adhere to the following workflow:

1. **Step Definition & User Approval (`/orchestrator`)**:
   - The Orchestrator defines the atomic scope of the current step, the exact files involved, and the verification method.
   - The Orchestrator halts and obtains user approval before proceeding.

2. **Execution (`/coding-specialist`)**:
   - The Coding Specialist writes complete, production-grade code.
   - No placeholders (`// ... rest of code`) are permitted.
   - Strictly obeys architectural boundaries (AppData isolation, pure parsers, monochrome minimal SVGs, size constraints).

3. **Audit & Verification (`/code-reviewer`)**:
   - The Code Reviewer inspects the code for:
     - Logic correctness & security (e.g. command injection risks with URL args)
     - Adherence to monochrome SVG iconography (zero emoji)
     - AppData portable path handling
     - Code cleanliness & DRY
   - Runs `cargo check` / tests to confirm successful build.

4. **User Checkpoint**:
   - The Orchestrator presents the review summary and prompts for approval to proceed to the next step.
