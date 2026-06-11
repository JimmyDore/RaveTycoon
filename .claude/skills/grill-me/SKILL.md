---
name: grill-me
description: Interview the user relentlessly about a plan or design until reaching shared understanding. Accepts optional Jira ticket, Sentry URL, or Slack link as starting context. Use when user wants to stress-test a plan, brainstorm an approach, get grilled on their design, or mentions "grill me".
allowed-tools: Read, Glob, Grep, Bash, AskUserQuestion, Task
---

# Grill Me

Interview the user relentlessly about every aspect of a plan until we reach a shared understanding. Walk down each branch of the decision tree, resolving dependencies between decisions one-by-one.

## Starting Context

Check if the user provided any of these as input:

1. **Jira ticket** (e.g., `DEV-1234`): fetch via Jira MCP tools, use as starting point
2. **Sentry URL**: fetch via Sentry MCP tools, extract error context
3. **Slack link**: fetch via Slack MCP tools, extract conversation context
4. **Free text**: use the description as-is

If no input is provided, ask: "What do you want to get grilled on?"

## Rules

**One question at a time.** Never dump a list of questions.

**Explore the codebase before asking.** If a question can be answered by reading code, reading tests, or grepping the repo — do it yourself. Only ask the user things the codebase cannot answer:

- Business intent and priorities
- Scope decisions (what's in vs what's out)
- Tradeoffs that require a human judgment call
- Edge cases that need a product decision
- UX preferences
- Non-functional requirements (performance, cost constraints)

**For each question, provide your recommended answer.** Don't just ask — propose what you think the answer should be based on what you've seen in the code. Let the user confirm, correct, or redirect.

**Follow the decision tree.** Each answer may open new branches. Pursue them. If an answer raises a technical question you can resolve by exploring code, do that before asking the next question.

**Know when to stop.** When you could explain the plan to another developer with zero ambiguities, say: "I think we've covered everything. Ready for `/to-prd` when you are." Summarize the key decisions made.

## What NOT to Do

- Don't write any documents, PRDs, or specs — this is a conversation
- Don't write code
- Don't dump 5 questions at once
- Don't ask things you could find in the codebase
- Don't skip branches of the decision tree because they seem minor
