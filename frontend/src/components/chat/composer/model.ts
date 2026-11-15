/**
 * Pure helpers behind the Telegram Web K composer. They are intentionally kept
 * out of the components so the capability/placeholder rules stay readable and
 * unit-testable without a DOM.
 */
import type { BotCommandInfo, Chat, ChatProfile } from "../../../types";

/**
 * Capability fields the composer reads beyond the shared ChatProfile. They are
 * declared here (and cast onto the profile) until types.ts owns them, so the
 * component compiles before the bindings regen.
 */
export interface ComposerProfileCapabilities {
  /** Member/subscriber of a group or channel (never false for private chats). */
  isMember?: boolean;
  /** Broadcast channel: only admins post (Web K `isBroadcast`). */
  isBroadcast?: boolean;
  /** "Gigagroup": admins post, members read (Web K `isBroadcastGroup`). */
  isBroadcastGroup?: boolean;
  /** A non-member may join from the footer plate. */
  canJoin?: boolean;
  /** Joining needs an admin's approval → APPLY TO JOIN GROUP. */
  joinRequest?: boolean;
  /** The current account blocked this private peer. */
  isBlocked?: boolean;
  /** The current admin posts anonymously → "Send anonymously" placeholder. */
  isAnonymous?: boolean;
  /** Media attachments are allowed (attach menu entries). */
  canSendMedia?: boolean;
  /** Linked direct-messages chat id; shows the comments side button. */
  linkedMonoforumId?: string;
}

/** ChatProfile with the composer capability additions. */
export type ComposerProfile = ChatProfile & ComposerProfileCapabilities;

/** A bot command with its owning bot's username (groups insert `/cmd@bot`). */
export interface ComposerBotCommand extends BotCommandInfo {
  botUsername?: string;
}

/** Footer control buttons of the Web K control plate. */
export type ComposerControl =
  | "start"
  | "unblock"
  | "mute"
  | "join"
  | "apply"
  | "subscribe";

/** Placeholder keys in Web K's priority order (input.ts:3656-3732). */
export type ComposerPlaceholder =
  | "message"
  | "broadcast"
  | "textNotAllowed"
  | "sendAnonymously"
  | "comment";

export interface ComposerState {
  kind: "compose" | "control";
  /** Set when kind is "control": which footer button the plate shows. */
  control?: ComposerControl;
  /** The text field is read-only (posting text is not allowed). */
  readOnly: boolean;
  placeholder: ComposerPlaceholder;
  /** Broadcast channel plate keeps the gift icon on the right. */
  showGift: boolean;
  /** Linked direct-messages chat keeps the comments icon on the left. */
  showComments: boolean;
}

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

/**
 * Resolves which footer shape Web K renders for this chat. It ports the
 * `haveSomethingInControl` branch of input.ts:3329-3458 and the placeholder
 * order of input.ts:3656-3732:
 *
 * - bot with no history / blocked bot → START;
 * - blocked private user → Unblock;
 * - broadcast channel: non-member → SUBSCRIBE, subscriber → MUTE (+gift);
 * - broadcast group: non-member → JOIN/APPLY, member → MUTE;
 * - group left → JOIN / APPLY TO JOIN GROUP;
 * - otherwise the normal plate, read-only when text posting is banned.
 */
export function resolveComposerState(options: {
  chat?: Chat;
  profile?: ChatProfile | null;
  hasMessages: boolean;
}): ComposerState {
  const { chat, hasMessages } = options;
  const profile = options.profile as ComposerProfile | null | undefined;
  const bot = isBotChat(chat, profile);
  const channel = isChannelChat(chat, profile);
  const group = isGroupChat(chat, profile);
  const compose: ComposerState = {
    kind: "compose",
    readOnly: false,
    placeholder: "message",
    showGift: false,
    showComments: false,
  };

  // Before the profile resolves only two capabilities are known: bot chats
  // without history (START) and the normal composer.
  if (!profile) {
    if (bot && !hasMessages) {
      return { ...compose, kind: "control", control: "start" };
    }
    if (channel) {
      // The channel footer cannot be guessed; keep the normal plate quiet until
      // the profile arrives (the caller shows the skeleton while loading).
      return compose;
    }
    return compose;
  }

  if (bot && (!hasMessages || profile.isBlocked)) {
    return { ...compose, kind: "control", control: "start" };
  }
  if (!channel && !group && profile.isBlocked) {
    return { ...compose, kind: "control", control: "unblock" };
  }

  const broadcast = Boolean(profile.isBroadcast) || (channel && !group);
  const broadcastGroup = Boolean(profile.isBroadcastGroup);
  const member = profile.isMember !== false;
  const canPost = profile.canSend !== false;

  if ((channel || group) && !canPost) {
    if (broadcast && !broadcastGroup) {
      if (!member) {
        return { ...compose, kind: "control", control: "subscribe" };
      }
      return {
        ...compose,
        kind: "control",
        control: "mute",
        showGift: true,
        showComments: Boolean(profile.linkedMonoforumId),
      };
    }
    if (broadcastGroup) {
      if (!member) {
        return {
          ...compose,
          kind: "control",
          control: profile.joinRequest ? "apply" : "join",
        };
      }
      return { ...compose, kind: "control", control: "mute" };
    }
    if (!member) {
      return {
        ...compose,
        kind: "control",
        control: profile.joinRequest ? "apply" : "join",
      };
    }
    // A restricted member keeps the normal plate: Web K only adds the
    // .chat-input.is-hidden state class, which has no CSS in the bundle.
  }

  const readOnly =
    profile.canSendPlain === false || profile.canSend === false;
  let placeholder: ComposerPlaceholder = "message";
  if (profile.canSendPlain === false) {
    placeholder = "textNotAllowed";
  } else if (broadcast) {
    placeholder = "broadcast";
  } else if (profile.isAnonymous) {
    placeholder = "sendAnonymously";
  }
  return { ...compose, readOnly, placeholder };
}

/** Telegram commands arrive without the leading slash; normalise both shapes. */
export function normalizeCommand(command: string): string {
  return command.trim().replace(/^\/+/, "");
}

/**
 * The text inserted when a command is chosen from the list: a private bot chat
 * sends "/command", a group appends the owning bot's username ("/command@bot",
 * commandsHelper.ts:24-30). Groups without an owner username keep the bare form.
 */
export function commandInsertText(
  command: BotCommandInfo,
  chat: Chat | undefined,
  profile: ChatProfile | null | undefined,
): string {
  const name = normalizeCommand(command.command);
  const owner = (command as ComposerBotCommand).botUsername?.trim();
  if (owner && !isBotChat(chat, profile) && (isGroupChat(chat, profile) || isChannelChat(chat, profile))) {
    return `/${name}@${owner}`;
  }
  return `/${name}`;
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
