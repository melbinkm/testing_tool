# CLAUDE.md - AI Agent Development Guidelines

## Core Principles

### 1. Never Trust Memory - Always Read Code
- Before modifying any file, READ it first using the Read tool
- Don't assume you know what's in a file from previous conversations
- Code changes between sessions; always verify current state
- When referencing functions or classes, confirm they still exist and haven't changed

### 2. Don't Delete Code Unnecessarily
- Preserve existing functionality unless explicitly asked to remove it
- Comment out code temporarily instead of deleting when debugging
- If removing code, explain why in the commit message
- Check for dependencies before removing any function or module
- Use version control - commit before major deletions

### 3. Write and Run Tests for Every Feature
- Create unit tests for every new function or module
- Run existing tests before and after changes to catch regressions
- Test files should mirror source structure (src/foo.ts → tests/foo.test.ts)
- Include edge cases and error conditions in tests
- Never skip tests to "save time"

### 4. Plan Before Major Changes
- Create a written plan before any significant modification
- Identify what could break before making changes
- List all files that will be affected
- Consider backward compatibility
- Document the rollback strategy

### 5. Maintain SETUP.md
- Update SETUP.md after every major change
- Include new dependencies, configuration changes, and usage instructions
- Keep examples current and working
- Document breaking changes prominently

## Pre-Change Checklist
Before making any change:
- [ ] Read all files that will be modified
- [ ] Understand existing tests for affected code
- [ ] Identify dependencies and dependents
- [ ] Create a plan for non-trivial changes
- [ ] Consider what could break

## Post-Change Checklist
After making changes:
- [ ] Run all tests
- [ ] Update SETUP.md if needed
- [ ] Verify the feature works end-to-end
- [ ] Check for console errors or warnings
- [ ] Update any affected documentation

## MCP Server Development Rules
- Always validate scope before executing actions
- Include correlation IDs in all requests
- Implement rate limiting and budget tracking
- Log all actions for audit trail
- Fail closed on errors (deny by default)

## Security Considerations
- Never hardcode credentials or API keys
- Validate all inputs from external sources
- Enforce scope boundaries in code, not prompts
- Require human approval for high-risk actions
- Redact sensitive data in logs and evidence
