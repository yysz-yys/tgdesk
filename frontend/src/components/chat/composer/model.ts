/**
 * Pure helpers behind the Telegram Web K composer. They are intentionally kept
 * out of the components so the capability/placeholder rules stay readable and
 * unit-testable without a DOM.
 */
import type { BotCommandInfo, Chat, ChatProfile } from "../../../types";

/** A private bot chat: either the backend profile says "bot" or the dialog is a bot. */
export function isBotChat(
  chat: Chat | undefined,
  profile: ChatProfile | null | undefined,
): boolean {
  return (
    profile?.type === "bot" ||
    (chat?.kind === "private" && Boolean(chat?.bot))
  );
}

/** Broadcast channel (subscriber footer vs. admin composer). */
export function isChannelChat(
  chat: Chat | undefined,
  profile: ChatProfile | null | undefined,
): boolean {
  return chat?.kind === "channel" || profile?.type === "channel";
}

/** Groups allow `/command` autocomplete for group bots (Web K behaviour). */
export function isGroupChat(
  chat: Chat | undefined,
  profile: ChatProfile | null | undefined,
): boolean {
  return chat?.kind === "group" || profile?.type === "group";
}

export function canAutocompleteCommands(
  chat: Chat | undefined,
  profile: ChatProfile | null | undefined,
): boolean {
  return isBotChat(chat, profile) || isGroupChat(chat, profile);
}

/** Telegram commands arrive without the leading slash; normalise both shapes. */
export function normalizeCommand(command: string): string {
  return command.trim().replace(/^\/+/, "");
}

/** Filters the bot command list by the text typed after "/" (prefix, Web K). */
export function filterBotCommands(
  commands: BotCommandInfo[] | undefined,
  query: string,
): BotCommandInfo[] {
  if (!commands || commands.length === 0) {
    return [];
  }
  const needle = query.trim().replace(/^\/+/, "").toLowerCase();
  if (!needle) {
    return commands;
  }
  return commands.filter((command) =>
    normalizeCommand(command.command).toLowerCase().startsWith(needle),
  );
}

/** The text after "/" while the message is a single leading command token. */
export function commandQuery(value: string): string | null {
  const match = /^\/([A-Za-z0-9_]*)$/.exec(value);
  return match ? match[1] : null;
}

/** Web K slow-mode timer format: 0:12 for minutes, 1:02:03 for hours. */
export function formatSlowTimer(seconds: number): string {
  const total = Math.max(0, Math.ceil(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  const paddedSeconds = String(rest).padStart(2, "0");
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${paddedSeconds}`;
  }
  return `${minutes}:${paddedSeconds}`;
}

/**
 * The start of a textarea value must be a lone "/" token for the command list
 * to trigger; anything after whitespace belongs to the message body.
 */
export function isCommandAutocompleteOpen(
  value: string,
  chat: Chat | undefined,
  profile: ChatProfile | null | undefined,
): boolean {
  if (!canAutocompleteCommands(chat, profile) || !profile?.botCommands?.length) {
    return false;
  }
  return commandQuery(value) !== null;
}
