import type { Chat, ChatFolder } from "../types";

/** The opaque chat id stores the peer type/id/access hash; folders only need
 * the stable type/id prefix. */
export function chatPeerKey(id: string) {
  return id.split(":").slice(0, 2).join(":");
}

export function chatMatchesFolder(folder: ChatFolder, chat: Chat) {
  const key = chatPeerKey(chat.id);
  if (folder.excludeKeys.includes(key)) {
    return false;
  }

  const hasPositiveRules =
    folder.chatKeys.length > 0 ||
    Boolean(folder.groups) ||
    Boolean(folder.broadcasts) ||
    Boolean(folder.contacts) ||
    Boolean(folder.nonContacts) ||
    Boolean(folder.bots);

  let matched = folder.chatKeys.includes(key);
  if (folder.groups && chat.kind === "group") {
    matched = true;
  }
  if (folder.broadcasts && chat.kind === "channel") {
    matched = true;
  }
  if (folder.bots && chat.bot) {
    matched = true;
  }
  if (folder.contacts && chat.contact) {
    matched = true;
  }
  if (folder.nonContacts && chat.kind === "private" && !chat.contact && !chat.bot) {
    matched = true;
  }
  if (!hasPositiveRules) {
    matched = true;
  }
  if (!matched) {
    return false;
  }
  if (folder.excludeMuted && chat.muted) {
    return false;
  }
  if (folder.excludeRead && !chat.unread) {
    return false;
  }
  if (folder.excludeArchived && chat.archived) {
    return false;
  }
  return true;
}
