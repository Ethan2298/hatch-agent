import React, { useState } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';

export function App() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);

  const handleSubmit = async (value: string) => {
    if (!value.trim()) return;

    setMessages(prev => [...prev, { role: 'user', content: value }]);
    setInput('');

    // TODO: Call AI and generate .hatch script
    setMessages(prev => [...prev, {
      role: 'assistant',
      content: `I'll help you create a script for: "${value}"`
    }]);
  };

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="yellow">🥚 Hatch</Text>
        <Text dimColor> - AI-powered Python script generator</Text>
      </Box>

      {messages.map((msg, i) => (
        <Box key={i} marginBottom={1}>
          <Text color={msg.role === 'user' ? 'cyan' : 'green'}>
            {msg.role === 'user' ? '> ' : '🤖 '}
          </Text>
          <Text>{msg.content}</Text>
        </Box>
      ))}

      <Box>
        <Text color="cyan">&gt; </Text>
        <TextInput
          value={input}
          onChange={setInput}
          onSubmit={handleSubmit}
          placeholder="Describe what you want to automate..."
        />
      </Box>
    </Box>
  );
}
