import React, { useState, useEffect, useRef } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { runHatch, HatchEvent } from '../agent/hatch.js';

interface DisplayMessage {
  type: 'user' | 'assistant' | 'tool_use' | 'tool_result' | 'error';
  content: string;
  toolName?: string;
  isStreaming?: boolean;
}

export function App() {
  const { exit } = useApp();
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [isProcessing, setIsProcessing] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [currentTool, setCurrentTool] = useState<string | null>(null);
  const [toolInput, setToolInput] = useState('');

  // Handle Ctrl+C
  useInput((inputChar, key) => {
    if (key.ctrl && inputChar === 'c') {
      exit();
    }
  });

  const handleSubmit = async (value: string) => {
    if (!value.trim() || isProcessing) return;

    const userInput = value.trim();
    setInput('');
    setMessages((prev) => [...prev, { type: 'user', content: userInput }]);
    setIsProcessing(true);
    setStreamingText('');
    setCurrentTool(null);
    setToolInput('');

    try {
      for await (const event of runHatch(userInput, sessionId)) {
        switch (event.type) {
          case 'init':
            setSessionId(event.sessionId);
            break;

          // Real-time text streaming
          case 'text_delta':
            if (event.text) {
              setStreamingText((prev) => prev + event.text);
            }
            break;

          // Complete text (flush streaming buffer)
          case 'text':
            if (streamingText || event.text) {
              const finalText = event.text || streamingText;
              setMessages((prev) => [...prev, { type: 'assistant', content: finalText }]);
              setStreamingText('');
            }
            break;

          // Tool starting
          case 'tool_use_start':
            // Flush any streaming text first
            if (streamingText) {
              setMessages((prev) => [...prev, { type: 'assistant', content: streamingText }]);
              setStreamingText('');
            }
            setCurrentTool(event.toolName || null);
            setToolInput('');
            if (event.toolInput) {
              const display = formatToolDisplay(event.toolName!, event.toolInput!);
              const content = display.detail
                ? `${display.label}: ${display.detail}`
                : display.label;
              setMessages((prev) => [
                ...prev,
                {
                  type: 'tool_use',
                  content,
                  toolName: event.toolName,
                },
              ]);
              setCurrentTool(null);
            }
            break;

          // Tool input streaming
          case 'tool_input_delta':
            if (event.toolInputDelta) {
              setToolInput((prev) => prev + event.toolInputDelta);
            }
            break;

          // Tool result
          case 'tool_result':
            setCurrentTool(null);
            setToolInput('');
            if (event.toolResult) {
              setMessages((prev) => [
                ...prev,
                {
                  type: 'tool_result',
                  content: truncate(event.toolResult!, 800),
                },
              ]);
            }
            break;

          case 'error':
            setMessages((prev) => [
              ...prev,
              { type: 'error', content: event.error! },
            ]);
            break;

          case 'done':
            // Flush any remaining streaming text
            if (streamingText) {
              setMessages((prev) => [...prev, { type: 'assistant', content: streamingText }]);
              setStreamingText('');
            }
            if (event.sessionId) {
              setSessionId(event.sessionId);
            }
            break;
        }
      }
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          type: 'error',
          content: error instanceof Error ? error.message : String(error),
        },
      ]);
    }

    setIsProcessing(false);
    setStreamingText('');
    setCurrentTool(null);
    setToolInput('');
  };

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color="yellow">
          🥚 Hatch
        </Text>
        <Text dimColor> — AI-powered Python script generator</Text>
      </Box>

      {/* Messages */}
      <Box flexDirection="column" marginBottom={1}>
        {messages.map((msg, i) => (
          <MessageDisplay key={i} message={msg} />
        ))}

        {/* Streaming text (real-time) */}
        {streamingText && (
          <Box marginBottom={1} flexDirection="column">
            <Text color="green" bold>
              Hatch:
            </Text>
            <Box marginLeft={2}>
              <Text>{streamingText}</Text>
              <Text color="yellow">▊</Text>
            </Box>
          </Box>
        )}

        {/* Tool in progress */}
        {currentTool && (
          <Box marginBottom={1}>
            <Text color="magenta">
              {getToolProgressLabel(currentTool)}
              <Text color="yellow">...</Text>
            </Text>
          </Box>
        )}

        {/* Thinking indicator */}
        {isProcessing && !streamingText && !currentTool && (
          <Box>
            <Text color="yellow">⚡ Thinking...</Text>
          </Box>
        )}
      </Box>

      {/* Input */}
      <Box>
        <Text color="cyan">{'> '}</Text>
        {isProcessing ? (
          <Text dimColor>waiting...</Text>
        ) : (
          <TextInput
            value={input}
            onChange={setInput}
            onSubmit={handleSubmit}
            placeholder="Describe what you want to automate..."
          />
        )}
      </Box>

      {/* Help */}
      <Box marginTop={1}>
        <Text dimColor>Ctrl+C to exit</Text>
      </Box>
    </Box>
  );
}

function MessageDisplay({ message }: { message: DisplayMessage }) {
  switch (message.type) {
    case 'user':
      return (
        <Box marginBottom={1}>
          <Text color="cyan" bold>
            You:{' '}
          </Text>
          <Text>{message.content}</Text>
        </Box>
      );

    case 'assistant':
      return (
        <Box marginBottom={1} flexDirection="column">
          <Text color="green" bold>
            Hatch:
          </Text>
          <Box marginLeft={2}>
            <Text>{message.content}</Text>
          </Box>
        </Box>
      );

    case 'tool_use':
      return (
        <Box marginBottom={1}>
          <Text color="magenta">{message.content}</Text>
        </Box>
      );

    case 'tool_result':
      return (
        <Box marginBottom={1} flexDirection="column">
          <Text color="blue">✓ Result:</Text>
          <Box marginLeft={2}>
            <Text dimColor>{message.content}</Text>
          </Box>
        </Box>
      );

    case 'error':
      return (
        <Box marginBottom={1}>
          <Text color="red" bold>
            Error:{' '}
          </Text>
          <Text color="red">{message.content}</Text>
        </Box>
      );

    default:
      return null;
  }
}

function getToolProgressLabel(name: string): string {
  const n = name.toLowerCase();
  if (n === 'bash') return '⚡ Running';
  if (n === 'write') return '✏️ Creating file';
  if (n === 'edit' || n === 'multiedit') return '🔧 Editing';
  if (n === 'read') return '👀 Reading';
  if (n === 'glob' || n === 'grep') return '🔍 Searching';
  if (n === 'ls') return '📂 Looking at folder';
  if (n === 'websearch') return '🌐 Searching web';
  if (n === 'webfetch') return '🌐 Loading page';
  if (n === 'todowrite' || n === 'todoread') return '📝 Organizing';
  if (n === 'task') return '🤔 Working';
  return '⚙️ Working';
}

function formatToolDisplay(name: string, input: Record<string, unknown>): { label: string; detail: string } {
  const n = name.toLowerCase();

  if (n === 'bash') {
    const cmd = String(input.command || '');
    // Extract meaningful part of command
    if (cmd.startsWith('python')) {
      return { label: '⚡ Running script', detail: cmd };
    }
    if (cmd.startsWith('pip install')) {
      return { label: '📦 Installing package', detail: cmd.replace('pip install ', '') };
    }
    return { label: '⚡ Running', detail: cmd };
  }

  if (n === 'write') {
    const path = String(input.file_path || input.path || '');
    const filename = path.split(/[/\\]/).pop() || path;
    return { label: '✏️ Creating file', detail: filename };
  }

  if (n === 'edit' || n === 'multiedit') {
    const path = String(input.file_path || input.path || '');
    const filename = path.split(/[/\\]/).pop() || path;
    return { label: '🔧 Editing', detail: filename };
  }

  if (n === 'read') {
    const path = String(input.file_path || input.path || '');
    const filename = path.split(/[/\\]/).pop() || path;
    return { label: '👀 Reading', detail: filename };
  }

  if (n === 'glob') {
    return { label: '🔍 Finding files', detail: String(input.pattern || '') };
  }

  if (n === 'grep') {
    return { label: '🔍 Searching for', detail: `"${input.pattern}"` };
  }

  if (n === 'ls') {
    const path = String(input.path || '.');
    return { label: '📂 Listing folder', detail: path };
  }

  if (n === 'websearch') {
    return { label: '🌐 Searching web', detail: String(input.query || '') };
  }

  if (n === 'webfetch') {
    const url = String(input.url || '');
    // Show just the domain
    try {
      const domain = new URL(url).hostname;
      return { label: '🌐 Loading', detail: domain };
    } catch {
      return { label: '🌐 Loading page', detail: url };
    }
  }

  if (n === 'todowrite' || n === 'todoread') {
    return { label: '📝 Organizing tasks', detail: '' };
  }

  if (n === 'task') {
    return { label: '🤔 Working on subtask', detail: '' };
  }

  return { label: `⚙️ ${name}`, detail: '' };
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen) + '\n... (truncated)';
}
