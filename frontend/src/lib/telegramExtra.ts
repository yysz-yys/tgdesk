/**
 * Typed access to the round-3 kernel APIs. The generated Wails bindings are
 * updated when the Go methods land; this thin façade keeps the React code
 * compiling against the agreed contract in the meantime and gives one place to
 * cast the generated service object.
 */
import { Service as AppService } from "../../bindings/tgdesk/internal/app";
import type { KernelChat, KernelMessage } from "../data/telegram";
import type {
  ChatGiftsPage,
  GifSearchPage,
  StickerDoc,
  StickerSearch,
  StickerSetInfo,
} from "../types";

interface ExtraBindings {
  StartBot(
    chatID: string,
    startParam: string,
    proxy: string,
    ntp: string,
  ): Promise<void>;
  GetPinnedMessage(
    chatID: string,
    proxy: string,
    ntp: string,
  ): Promise<KernelMessage | null>;
  GetPinnedMessageInfo(
    chatID: string,
    proxy: string,
    ntp: string,
  ): Promise<KernelPinnedMessageInfo | null>;
  UpdatePinnedMessage(
    chatID: string,
    messageID: number,
    unpin: boolean,
    silent: boolean,
    proxy: string,
    ntp: string,
  ): Promise<void>;
  GetContacts(proxy: string, ntp: string): Promise<KernelContact[] | null>;
  SetChatPhoto(
    proxy: string,
    ntp: string,
    chatID: string,
    photoBase64: string,
  ): Promise<void>;
  UnpinAllMessages(chatID: string, proxy: string, ntp: string): Promise<void>;
  GetSavedChats(
    proxy: string,
    ntp: string,
  ): Promise<{ chats: KernelChat[]; count: number } | null>;
  GetChatGifts(
    chatID: string,
    offset: string,
    limit: number,
    proxy: string,
    ntp: string,
  ): Promise<ChatGiftsPage | null>;
  SearchStickers(
    query: string,
    limit: number,
    proxy: string,
    ntp: string,
  ): Promise<StickerSearch | null>;
  GetFavedStickers(
    proxy: string,
    ntp: string,
  ): Promise<StickerDoc[] | null>;
  SetStickerFaved(
    ref: string,
    faved: boolean,
    proxy: string,
    ntp: string,
  ): Promise<void>;
  ClearRecentStickers(proxy: string, ntp: string): Promise<void>;
  GetFeaturedStickerSets(
    proxy: string,
    ntp: string,
  ): Promise<StickerSetInfo[] | null>;
  InstallStickerSet(
    ref: string,
    proxy: string,
    ntp: string,
  ): Promise<void>;
  UninstallStickerSet(
    ref: string,
    proxy: string,
    ntp: string,
  ): Promise<void>;
  ArchiveStickerSet(
    ref: string,
    archived: boolean,
    proxy: string,
    ntp: string,
  ): Promise<void>;
  SearchGifs(
    query: string,
    offset: string,
    proxy: string,
    ntp: string,
  ): Promise<GifSearchPage | null>;
  SendInlineGif(
    chatID: string,
    queryID: number,
    resultID: string,
    replyToID: number,
    proxy: string,
    ntp: string,
  ): Promise<void>;
  SetGifSaved(
    ref: string,
    saved: boolean,
    proxy: string,
    ntp: string,
  ): Promise<void>;
  SendWebViewData(
    chatID: string,
    botPeerID: string,
    queryID: number,
    data: string,
    proxy: string,
    ntp: string,
  ): Promise<void>;
  ProlongWebView(
    chatID: string,
    botPeerID: string,
    queryID: number,
    proxy: string,
    ntp: string,
  ): Promise<void>;
}

const api = AppService as unknown as ExtraBindings;

export function getPinnedMessage(
  chatID: string,
  proxy: string,
  ntp: string,
): Promise<KernelMessage | null> {
  return api.GetPinnedMessage(chatID, proxy, ntp);
}

/** Web K START plate: messages.startBot for a bot without a history. */
export function startBot(
  chatID: string,
  startParam: string,
  proxy: string,
  ntp: string,
): Promise<void> {
  return api.StartBot(chatID, startParam, proxy, ntp);
}

/** Web K's floating pinned plate: newest pin + count + canPin. */
export interface KernelPinnedMessageInfo {
  message?: KernelMessage | null;
  /** Number of pinned messages (>1 draws the dashed bar + #N counter). */
  count?: number;
  /** Newest pinned message id (hidden-until-newer-pin bookkeeping). */
  maxId?: number;
  /** Whether the account may (un)pin in this chat. */
  canPin?: boolean;
}

/** One contact row of the New Private Chat page. */
export interface KernelContact {
  id?: number;
  /** Opaque peer id (user:<id>:<accessHash>) for opening the chat. */
  peerId?: string;
  name?: string;
  username?: string;
  avatarUrl?: string;
  colorIndex?: number;
  online?: boolean;
  lastSeen?: number;
  status?: string;
}

export function getPinnedMessageInfo(
  chatID: string,
  proxy: string,
  ntp: string,
): Promise<KernelPinnedMessageInfo | null> {
  return api.GetPinnedMessageInfo(chatID, proxy, ntp);
}

export function updatePinnedMessage(
  chatID: string,
  messageID: number,
  unpin: boolean,
  silent: boolean,
  proxy: string,
  ntp: string,
): Promise<void> {
  return api.UpdatePinnedMessage(chatID, messageID, unpin, silent, proxy, ntp);
}

export function getContacts(
  proxy: string,
  ntp: string,
): Promise<KernelContact[]> {
  return api.GetContacts(proxy, ntp).then((value) => value ?? []);
}

export function setChatPhoto(
  proxy: string,
  ntp: string,
  chatID: string,
  photoBase64: string,
): Promise<void> {
  return api.SetChatPhoto(proxy, ntp, chatID, photoBase64);
}

export function unpinAllMessages(
  chatID: string,
  proxy: string,
  ntp: string,
): Promise<void> {
  return api.UnpinAllMessages(chatID, proxy, ntp);
}

export function getSavedChats(
  proxy: string,
  ntp: string,
): Promise<{ chats: KernelChat[]; count: number } | null> {
  return api.GetSavedChats(proxy, ntp);
}

export function getChatGifts(
  chatID: string,
  offset: string,
  limit: number,
  proxy: string,
  ntp: string,
): Promise<ChatGiftsPage | null> {
  return api.GetChatGifts(chatID, offset, limit, proxy, ntp);
}

export function searchStickers(
  query: string,
  proxy: string,
  ntp: string,
  limit = 40,
): Promise<StickerSearch | null> {
  return api.SearchStickers(query, limit, proxy, ntp);
}

export function getFavedStickers(
  proxy: string,
  ntp: string,
): Promise<StickerDoc[]> {
  return api.GetFavedStickers(proxy, ntp).then((value) => value ?? []);
}

export function setStickerFaved(
  ref: string,
  faved: boolean,
  proxy: string,
  ntp: string,
): Promise<void> {
  return api.SetStickerFaved(ref, faved, proxy, ntp);
}

export function clearRecentStickers(
  proxy: string,
  ntp: string,
): Promise<void> {
  return api.ClearRecentStickers(proxy, ntp);
}

export function getFeaturedStickerSets(
  proxy: string,
  ntp: string,
): Promise<StickerSetInfo[]> {
  return api.GetFeaturedStickerSets(proxy, ntp).then((value) => value ?? []);
}

export function installStickerSet(
  ref: string,
  proxy: string,
  ntp: string,
): Promise<void> {
  return api.InstallStickerSet(ref, proxy, ntp);
}

export function uninstallStickerSet(
  ref: string,
  proxy: string,
  ntp: string,
): Promise<void> {
  return api.UninstallStickerSet(ref, proxy, ntp);
}

export function archiveStickerSet(
  ref: string,
  archived: boolean,
  proxy: string,
  ntp: string,
): Promise<void> {
  return api.ArchiveStickerSet(ref, archived, proxy, ntp);
}

export function searchGifs(
  query: string,
  offset: string,
  proxy: string,
  ntp: string,
): Promise<GifSearchPage | null> {
  return api.SearchGifs(query, offset, proxy, ntp);
}

export function sendInlineGif(
  chatID: string,
  queryID: number,
  resultID: string,
  replyToID: number,
  proxy: string,
  ntp: string,
): Promise<void> {
  return api.SendInlineGif(chatID, queryID, resultID, replyToID, proxy, ntp);
}

export function setGifSaved(
  ref: string,
  saved: boolean,
  proxy: string,
  ntp: string,
): Promise<void> {
  return api.SetGifSaved(ref, saved, proxy, ntp);
}

export function sendWebViewData(
  chatID: string,
  botPeerID: string,
  queryID: number,
  data: string,
  proxy: string,
  ntp: string,
): Promise<void> {
  return api.SendWebViewData(chatID, botPeerID, queryID, data, proxy, ntp);
}

export function prolongWebView(
  chatID: string,
  botPeerID: string,
  queryID: number,
  proxy: string,
  ntp: string,
): Promise<void> {
  return api.ProlongWebView(chatID, botPeerID, queryID, proxy, ntp);
}
