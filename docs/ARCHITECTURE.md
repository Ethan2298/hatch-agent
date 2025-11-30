# Hatch Agent - Technical Architecture

## Overview

Hatch is a terminal-based AI agent that generates and executes Python scripts for non-technical users.

---

## Core Design: 2 Tools Only

Following the highest-performing agent architecture: **minimal scaffolding, maximum control to the model.**

### Tool 1: Bash

Execute shell commands with persistent state across calls.

```typescript
interface BashTool {
  name: "bash";
  description: `Execute a bash command in a persistent shell session.
State is persistent across command calls.
Use this for: running Python scripts, pip install, file system operations, system commands.
When running multiple commands, use && to chain them.`;
  parameters: {
    command: string;
  };
  returns: {
    stdout: string;
    stderr: string;
    exitCode: number;
  };
}
```

---

### Tool 2: Edit (str_replace_editor)

A single tool for all file operations with 5 commands.

```typescript
interface EditTool {
  name: "edit";
  description: `A tool for viewing, creating, and editing files.

Commands:
- view: Read file contents
- create: Create a new file with content
- str_replace: Replace exact text in a file (must match exactly once)
- insert: Insert text at a specific line number
- undo_edit: Undo the last edit to a file

Always use absolute paths.`;
  parameters: {
    command: "view" | "create" | "str_replace" | "insert" | "undo_edit";
    path: string;                    // Absolute path (required for all)
    content?: string;                // For create
    old_str?: string;                // For str_replace
    new_str?: string;                // For str_replace
    insert_line?: number;            // For insert
    text?: string;                   // For insert
  };
}
```

#### Command Details

**view**
```typescript
{ command: "view", path: "/absolute/path/to/file.py" }
// Returns: file contents with line numbers
```

**create**
```typescript
{ command: "create", path: "/absolute/path/to/file.hatch", content: "#!/usr/bin/env python3\n..." }
// Returns: success confirmation
```

**str_replace**
```typescript
{
  command: "str_replace",
  path: "/absolute/path/to/file.py",
  old_str: "def old_function():",
  new_str: "def new_function():"
}
// Returns: success or error if old_str not found exactly once
```

**insert**
```typescript
{
  command: "insert",
  path: "/absolute/path/to/file.py",
  insert_line: 10,
  text: "# This line inserted at line 10"
}
// Returns: success confirmation
```

**undo_edit**
```typescript
{ command: "undo_edit", path: "/absolute/path/to/file.py" }
// Returns: reverts last edit, shows diff
```

---

## Design Principles

1. **Give control to the model** - Don't over-engineer the scaffold
2. **Tool descriptions matter** - Invest heavily in clear, unambiguous specs
3. **Require absolute paths** - Eliminates relative path confusion
4. **Strict string matching** - Exactly one match required for str_replace
5. **Persistent state** - Bash state carries across calls

---

## Agent Loop

```
┌──────────────────────────────────────────┐
│              AGENT LOOP                  │
├──────────────────────────────────────────┤
│                                          │
│  1. User message                         │
│     ↓                                    │
│  2. Send to LLM with tool definitions    │
│     ↓                                    │
│  3. LLM responds with:                   │
│     - Text (show to user)                │
│     - Tool call (execute it)             │
│     ↓                                    │
│  4. If tool call:                        │
│     - Execute tool                       │
│     - Send result back to LLM            │
│     - Go to step 3                       │
│     ↓                                    │
│  5. If no tool call: done                │
│                                          │
└──────────────────────────────────────────┘
```

The loop continues until the model stops calling tools.

---

## System Prompt

```
You are Hatch, an AI that creates Python scripts for users who don't know how to code.

You have two tools:
1. bash - Run shell commands (python, pip, ls, etc.)
2. edit - View, create, and edit files

Your workflow:
1. Understand what the user wants
2. Create a .hatch file (Python script) using edit command: create
3. Run it with bash command: python /path/to/script.hatch
4. If it fails, use edit command: str_replace to fix it
5. Repeat until it works

Rules:
- Always use absolute paths
- Create scripts in the user's current directory or ~/hatch-scripts/
- Include helpful print() statements so users see progress
- Handle errors gracefully
- Ask for clarification if the request is ambiguous

When editing files:
- str_replace requires the old_str to match EXACTLY once
- Include enough context in old_str to make it unique
- Use view first if you need to see the current file contents
```

---

## File Structure

```
hatch/
├── src/
│   ├── cli.tsx                 # Entry point
│   ├── components/
│   │   ├── App.tsx             # Main app shell
│   │   ├── Chat.tsx            # Conversation display
│   │   ├── Input.tsx           # User input
│   │   └── ToolOutput.tsx      # Tool execution display
│   ├── agent/
│   │   ├── loop.ts             # The agent loop
│   │   └── llm.ts              # Anthropic API client
│   └── tools/
│       ├── index.ts            # Tool definitions for LLM
│       ├── bash.ts             # Bash implementation
│       └── edit.ts             # Edit implementation (view/create/str_replace/insert/undo)
├── docs/
│   └── ARCHITECTURE.md
├── package.json
└── tsconfig.json
```

---

## Tool Implementation Details

### Bash Tool

```typescript
// tools/bash.ts
import { spawn } from 'child_process';

let shellProcess: ChildProcess | null = null;

export async function executeBash(command: string): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number;
}> {
  // Persistent shell - state carries across calls
  // On Windows: use powershell
  // On Mac/Linux: use bash
}
```

### Edit Tool

```typescript
// tools/edit.ts
const fileHistory: Map<string, string[]> = new Map(); // For undo

export async function executeEdit(params: EditParams): Promise<string> {
  switch (params.command) {
    case 'view':
      return viewFile(params.path);
    case 'create':
      return createFile(params.path, params.content);
    case 'str_replace':
      return strReplace(params.path, params.old_str, params.new_str);
    case 'insert':
      return insertLine(params.path, params.insert_line, params.text);
    case 'undo_edit':
      return undoEdit(params.path);
  }
}

function strReplace(path: string, oldStr: string, newStr: string): string {
  const content = readFileSync(path, 'utf-8');
  const matches = content.split(oldStr).length - 1;

  if (matches === 0) {
    throw new Error(`old_str not found in ${path}`);
  }
  if (matches > 1) {
    throw new Error(`old_str found ${matches} times, must be unique`);
  }

  // Save to history for undo
  saveHistory(path, content);

  const newContent = content.replace(oldStr, newStr);
  writeFileSync(path, newContent);
  return `Successfully replaced in ${path}`;
}
```

---

## MVP Checklist

- [ ] Agent loop (user → LLM → tool → LLM → ...)
- [ ] Bash tool with persistent state
- [ ] Edit tool with 5 commands (view, create, str_replace, insert, undo_edit)
- [ ] Streaming responses in terminal
- [ ] Tool execution display
- [ ] Basic error handling
