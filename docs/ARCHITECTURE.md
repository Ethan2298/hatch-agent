# Hatch Agent - Technical Architecture

## Overview

Hatch is a terminal-based AI agent that generates and executes Python scripts for non-technical users. The user describes what they want in natural language, the agent writes a `.hatch` script, and optionally runs it.

```
┌─────────────────────────────────────────────────────────────┐
│                        USER                                 │
│         "rename all my photos by date taken"                │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                    HATCH AGENT                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │   LLM API   │  │    Tools    │  │  Executor   │         │
│  │  (Anthropic)│  │ (Bash/File) │  │  (Python)   │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                   .hatch FILE                               │
│              (Python script output)                         │
└─────────────────────────────────────────────────────────────┘
```

---

## Core Principles

1. **Minimal scaffolding** - Let the model do the thinking
2. **Tool clarity** - Unambiguous tool descriptions, absolute paths
3. **Iteration built-in** - Run → Error → Fix → Run loop
4. **User control** - Always ask before executing, show what will happen

---

## Agent Loop

```
┌─────────────────────────────────────────────────────────────┐
│                     AGENT LOOP                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. USER INPUT                                              │
│     ↓                                                       │
│  2. LLM THINKS (what tools to use?)                        │
│     ↓                                                       │
│  3. TOOL CALL (bash, write, read, etc.)                    │
│     ↓                                                       │
│  4. TOOL RESULT → back to LLM                              │
│     ↓                                                       │
│  5. REPEAT until done or user stops                        │
│     ↓                                                       │
│  6. OUTPUT (.hatch file created)                           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Loop States

| State | Description |
|-------|-------------|
| `idle` | Waiting for user input |
| `thinking` | LLM is processing |
| `tool_call` | Executing a tool |
| `awaiting_permission` | Waiting for user to approve action |
| `complete` | Task finished |
| `error` | Something went wrong |

---

## Tools (Minimal Set)

Following the "2 tools" principle - keep it minimal.

### 1. Bash Tool

Execute shell commands. Used for:
- Running Python scripts
- Installing pip packages
- File system operations
- System commands

```typescript
interface BashTool {
  name: "bash";
  description: "Execute a shell command. Use for running scripts, installing packages, file operations.";
  parameters: {
    command: string;      // The command to run
    timeout?: number;     // Max execution time (ms)
  };
  returns: {
    stdout: string;
    stderr: string;
    exitCode: number;
  };
}
```

**Permissions:**
- Always show command before running
- Require explicit approval for: `rm`, `sudo`, network commands
- Auto-approve: `python`, `pip install`, `ls`, `cat`, `mkdir`

---

### 2. Write Tool

Create or overwrite files. Primary tool for generating `.hatch` scripts.

```typescript
interface WriteTool {
  name: "write";
  description: "Create or overwrite a file. Use absolute paths only.";
  parameters: {
    path: string;         // Absolute path to file
    content: string;      // File content
  };
  returns: {
    success: boolean;
    path: string;
  };
}
```

---

### 3. Read Tool

Read file contents. Used to understand existing files or check script output.

```typescript
interface ReadTool {
  name: "read";
  description: "Read contents of a file. Use absolute paths only.";
  parameters: {
    path: string;         // Absolute path to file
  };
  returns: {
    content: string;
    exists: boolean;
  };
}
```

---

### 4. Ask Tool

Ask user for clarification or choices.

```typescript
interface AskTool {
  name: "ask";
  description: "Ask the user a question when you need more information.";
  parameters: {
    question: string;
    options?: string[];   // Optional multiple choice
  };
  returns: {
    answer: string;
  };
}
```

---

## .hatch File Format

A `.hatch` file is just a Python script with a special header:

```python
#!/usr/bin/env python3
"""
Hatch Script: Rename photos by date
Created: 2024-11-29
Description: Renames all photos in a folder using their EXIF date taken
"""

import os
from PIL import Image
from PIL.ExifTags import TAGS
from datetime import datetime

def main():
    # Script logic here
    pass

if __name__ == "__main__":
    main()
```

**Conventions:**
- Always executable (`#!/usr/bin/env python3`)
- Docstring with name, date, description
- `main()` function as entry point
- Handle errors gracefully with user-friendly messages

---

## System Prompt

```
You are Hatch, an AI assistant that creates Python scripts for users.

Your job is to:
1. Understand what the user wants to accomplish
2. Write a Python script (.hatch file) that does it
3. Help them run it and fix any issues

Guidelines:
- Write single-file Python scripts
- Use standard library when possible, pip install if needed
- Always include error handling with helpful messages
- Ask clarifying questions if the request is ambiguous
- Show the user what you're about to do before doing it

Tools available:
- bash: Run shell commands
- write: Create/edit files
- read: Read file contents
- ask: Ask user questions

When writing scripts:
- Use absolute paths
- Include a docstring header
- Wrap in main() function
- Print helpful output so user knows what's happening
```

---

## UI Components (Ink/React)

### Main Screen Layout

```
┌─────────────────────────────────────────────────────────────┐
│ 🥚 Hatch                                           v0.1.0   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ 💬 Conversation history...                                  │
│                                                             │
│ > User message                                              │
│ 🤖 Assistant response                                       │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 📄 script.hatch                                         │ │
│ │ ```python                                               │ │
│ │ # Generated code preview                                │ │
│ │ ```                                                     │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ > Type your message...                              [Enter] │
└─────────────────────────────────────────────────────────────┘
```

### Permission Prompt

```
┌─────────────────────────────────────────────────────────────┐
│ ⚠️  Hatch wants to run a command:                           │
│                                                             │
│   python /Users/ethan/scripts/rename_photos.hatch           │
│                                                             │
│   [Y] Run   [N] Cancel   [E] Edit first                     │
└─────────────────────────────────────────────────────────────┘
```

---

## File Structure

```
hatch/
├── src/
│   ├── cli.tsx              # Entry point
│   ├── components/
│   │   ├── App.tsx          # Main app shell
│   │   ├── Chat.tsx         # Conversation view
│   │   ├── CodePreview.tsx  # Script preview
│   │   ├── Input.tsx        # User input
│   │   └── Permission.tsx   # Permission prompts
│   ├── agent/
│   │   ├── loop.ts          # Agent loop logic
│   │   ├── tools.ts         # Tool definitions
│   │   └── llm.ts           # Anthropic API calls
│   ├── tools/
│   │   ├── bash.ts          # Bash tool implementation
│   │   ├── read.ts          # Read tool implementation
│   │   ├── write.ts         # Write tool implementation
│   │   └── ask.ts           # Ask tool implementation
│   └── utils/
│       ├── config.ts        # User config
│       └── paths.ts         # Path utilities
├── docs/
│   └── ARCHITECTURE.md      # This file
├── package.json
├── tsconfig.json
└── bun.lock
```

---

## Configuration

User config stored in `~/.hatchrc` or `~/.config/hatch/config.json`:

```json
{
  "apiKey": "sk-ant-...",
  "model": "claude-sonnet-4-20250514",
  "scriptsDir": "~/hatch-scripts",
  "autoApprove": ["pip install", "python"],
  "theme": "dark"
}
```

---

## Error Handling & Iteration

When a script fails:

1. **Capture error** - Full stderr/traceback
2. **Send to LLM** - "The script failed with this error: ..."
3. **LLM fixes** - Generates updated script
4. **User approves** - Shows diff, user confirms
5. **Retry** - Run again

Max iterations: 3 (then ask user what to do)

---

## Security Considerations

1. **No auto-run** - Always ask before executing
2. **Sandboxing** - Consider running scripts in temp directory
3. **API key storage** - Use system keychain if possible
4. **Network commands** - Extra confirmation for curl, wget, etc.
5. **Destructive commands** - Block `rm -rf /`, `sudo rm`, etc.

---

## MVP Scope (v0.1)

**In scope:**
- [ ] Basic agent loop (input → LLM → tool → output)
- [ ] 4 tools: bash, write, read, ask
- [ ] Simple chat UI
- [ ] Code preview
- [ ] Permission prompts
- [ ] .hatch file generation
- [ ] Run scripts with Python

**Out of scope (later):**
- Web search
- Multi-file projects
- GUI apps
- Scheduling/cron
- Package management beyond pip
