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
              setMessages((prev) => [
                ...prev,
                {
                  type: 'tool_use',
                  content: formatToolInput(event.toolName!, event.toolInput!),
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
          <Box marginBottom={1} flexDirection="column">
            <Text color="magenta">⚙️ {currentTool}</Text>
            {toolInput && (
              <Box marginLeft={2}>
                <Text dimColor>{truncate(toolInput, 200)}</Text>
                <Text color="yellow">▊</Text>
              </Box>
            )}
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
        <Box marginBottom={1} flexDirection="column">
          <Text color="magenta">⚙️ {message.toolName}</Text>
          <Box marginLeft={2}>
            <Text dimColor>{message.content}</Text>
          </Box>
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

function formatToolInput(name: string, input: Record<string, unknown>): string {
  if (name === 'Bash' || name === 'bash') {
    return `$ ${input.command}`;
  }
  if (name === 'Edit' || name === 'edit') {
    return `${input.command} ${input.path || input.file_path || ''}`;
  }
  if (name === 'Write' || name === 'write') {
    return `write ${input.file_path || input.path || ''}`;
  }
  if (name === 'Read' || name === 'read') {
    return `read ${input.file_path || input.path || ''}`;
  }
  if (name === 'Glob' || name === 'glob') {
    return `glob ${input.pattern}`;
  }
  if (name === 'Grep' || name === 'grep') {
    return `grep "${input.pattern}"`;
  }
  if (name === 'LS' || name === 'ls') {
    return `ls ${input.path || '.'}`;
  }
  if (name === 'WebSearch' || name === 'websearch') {
    return `search: ${input.query}`;
  }
  if (name === 'WebFetch' || name === 'webfetch') {
    return `fetch: ${input.url}`;
  }
  return JSON.stringify(input, null, 2);
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen) + '\n... (truncated)';
}
