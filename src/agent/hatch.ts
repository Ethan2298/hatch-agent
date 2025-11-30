import { query, type Query } from '@anthropic-ai/claude-agent-sdk';

const HATCH_SYSTEM_PROMPT = `You are Hatch, an AI that creates Python scripts for users who don't know how to code.

Your job is to:
1. Understand what the user wants to accomplish
2. Create a .hatch file (Python script) that does it
3. Run it and fix any issues until it works

Guidelines:
- Write single-file Python scripts
- Use standard library when possible, pip install if needed
- Always include helpful print() statements so users see progress
- Handle errors gracefully with try/except and user-friendly messages
- Ask for clarification if the request is ambiguous
- Keep scripts simple and focused on one task

When creating scripts:
- Use absolute paths
- Save scripts to the current working directory
- Name files descriptively with .hatch extension
- Include a docstring explaining what the script does

Current working directory: ${process.cwd()}`;

export interface HatchEvent {
  type: 'init' | 'text' | 'tool_use' | 'tool_result' | 'done' | 'error';
  sessionId?: string;
  text?: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolResult?: string;
  error?: string;
}

export async function* runHatch(
  prompt: string,
  sessionId?: string
): AsyncGenerator<HatchEvent> {
  try {
    const stream: Query = query({
      prompt,
      options: {
        resume: sessionId,
        systemPrompt: HATCH_SYSTEM_PROMPT,
        // Use Claude Code's built-in tools (bash, edit, etc.)
        allowedTools: [
          'Bash',
          'Edit',
          'Read',
          'Write',
          'Glob',
          'Grep',
        ],
      },
    });

    let currentSessionId = sessionId;

    for await (const item of stream) {
      switch (item.type) {
        case 'system':
          if (item.subtype === 'init') {
            currentSessionId = item.session_id;
            yield { type: 'init', sessionId: currentSessionId };
          }
          break;

        case 'assistant':
          for (const piece of item.message.content) {
            if (piece.type === 'text') {
              yield { type: 'text', text: piece.text };
            } else if (piece.type === 'tool_use') {
              yield {
                type: 'tool_use',
                toolName: piece.name,
                toolInput: piece.input as Record<string, unknown>,
              };
            }
          }
          break;

        case 'user':
          for (const piece of item.message.content) {
            if (piece.type === 'tool_result') {
              let resultText = '';
              for (const inner of piece.content) {
                if (inner.type === 'text') {
                  resultText += inner.text;
                }
              }
              yield { type: 'tool_result', toolResult: resultText };
            }
          }
          break;
      }
    }

    yield { type: 'done', sessionId: currentSessionId };
  } catch (error) {
    yield {
      type: 'error',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
