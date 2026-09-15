import { test as base, expect, type ConsoleMessage, type Page } from "@playwright/test";

function recordConsoleError(errors: string[], message: ConsoleMessage): void {
  if (message.type() === "error") errors.push(message.text());
}

function recordPageError(errors: string[], error: Error): void {
  errors.push(error.message);
}

async function guardAgainstConsoleErrors(
  { page }: { page: Page },
  use: () => Promise<void>,
): Promise<void> {
  const errors: string[] = [];
  page.on("console", recordConsoleError.bind(null, errors));
  page.on("pageerror", recordPageError.bind(null, errors));
  await use();
  const summary = errors.join("; ");
  expect(errors, `Unexpected console/page errors: ${summary}`).toEqual([]);
}

export const test = base.extend<{ consoleErrorGuard: void }>({
  consoleErrorGuard: [guardAgainstConsoleErrors, { auto: true }],
});

export { expect };
