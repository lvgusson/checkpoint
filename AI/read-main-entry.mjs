import { readFile } from 'node:fs/promises';

try {
  const content = await readFile(new URL('./main-entry.md', import.meta.url), 'utf8');
  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit',
        additionalContext: `Current instructions from AI/main-entry.md (reloaded for this message):\n\n${content}`,
      },
    }),
  );
} catch (error) {
  console.error(`Could not read AI/main-entry.md: ${error.message}`);
  process.exitCode = 2;
}
