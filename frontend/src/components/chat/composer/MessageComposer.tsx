import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type {
  Chat,
  ChatProfile,
  Message,
  UploadProgress,
} from "../../../types";
import { chatColor } from "../../../data/telegram";
import { insertEmojiAtCursor, restoreCaret } from "../../../lib/emojiInsert";
import { Icon } from "../../../ui";
import { EmojiPicker } from "../EmojiPicker";
import { AttachMenu } from "./AttachMenu";
import { BotCommandMenu } from "./BotCommandMenu";
import { BotMenuPill } from "./BotMenuPill";
import { ComposerButton } from "./ComposerButton";
import { ComposerReplyBar } from "./ComposerReplyBar";
import { ComposerUploadRow } from "./ComposerUploadRow";
import { SendButton, type SendButtonMode } from "./SendButton";
import {
  canAutocompleteCommands,
  commandInsertText,
  commandQuery,
  filterBotCommands,
  formatSlowTimer,
  isBotChat,
  isChannelChat,
  type ComposerBotCommand,
  type ComposerPlaceholder,
} from "./model";

const EMPTY_COMMANDS: ComposerBotCommand[] = [];
const DRAFT_PREFIX = "tgdesk.draft.";

/** Web K placeholder keys in the reference priority order (input.ts:3656). */
const PLACEHOLDER_KEYS: Record<ComposerPlaceholder, string> = {
  message: "input.message",
  broadcast: "input.broadcast",
  textNotAllowed: "input.textNotAllowed",
  sendAnonymously: "input.sendAnonymously",
  comment: "input.comment",
};

export interface MessageComposerProps {
  chatId: string;
  chat?: Chat;
  profile?: ChatProfile | null;
  /** True while the chat profile RPC is in flight (keeps the plate visually quiet). */
  busy?: boolean;
  replyingTo?: Message | null;
  editing?: Message | null;
  upload?: UploadProgress;
  enterToSend: boolean;
  /** Placeholder resolved from the capability state (Web K priority order). */
  placeholder?: ComposerPlaceholder;
  /** The text field is read-only (text posting is banned in this chat). */
  readOnly?: boolean;
  /**
   * Footer control plate rendered inside the same card and cross-faded over the
   * writing rows (tweb `.rows-wrapper-wrapper.is-centering-to-control`).
   */
  control?: ReactNode;
  onCancelContext: () => void;
  onSend: (text: string) => Promise<void>;
  onAttach: (caption: string) => Promise<boolean>;
  onOpenBotMenu?: () => void;
  onSendCommand?: (command: string) => Promise<void>;
  onToast: (message: string) => void;
  /** Typing-indicator signal (throttled by the parent): fired on input edits. */
  onTyping?: () => void;
  /** Fired when the input becomes empty: stop the typing signal. */
  onTypingStop?: () => void;
  /** Sticker/GIF picker: network params for the kernel RPCs. */
  network?: { proxy: string; ntp: string };
  onSendSticker?: (ref: string) => void | Promise<unknown>;
  onSendGif?: (ref: string) => void | Promise<unknown>;
  /** Sends an inline-bot GIF search result (query id + result id). */
  onSendInlineGif?: (queryId: number, resultId: string) => void | Promise<unknown>;
}

/**
 * Telegram Web K message composer plate: reply/edit header and upload progress
 * are rows inside the same 24 px floating card, followed by the input row
 * (bot pill / attach / editor / emoji / morphing send-mic). A capability footer
 * (START / JOIN / MUTE / Unblock) renders in the same card and cross-fades over
 * the writing rows without unmounting them.
 */
export function MessageComposer({
  chatId,
  chat,
  profile,
  busy,
  replyingTo,
  editing,
  upload,
  enterToSend,
  placeholder: placeholderKind,
  readOnly: readOnlyProp,
  control,
  onCancelContext,
  onSend,
  onAttach,
  onOpenBotMenu,
  onSendCommand,
  onToast,
  onTyping,
  onTypingStop,
  network,
  onSendSticker,
  onSendGif,
  onSendInlineGif,
}: MessageComposerProps) {
  const { t } = useTranslation();
  const draftKey = `${DRAFT_PREFIX}${chatId}`;
  const [text, setText] = useState(() => localStorage.getItem(draftKey) ?? "");
  const [editText, setEditText] = useState("");
  const [sending, setSending] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [commandMenuOpen, setCommandMenuOpen] = useState(false);
  /** Escape hides the "/"-triggered list until the query changes (Web K). */
  const [autocompleteSuppressed, setAutocompleteSuppressed] = useState(false);
  const [commandIndex, setCommandIndex] = useState(0);
  const [nowSeconds, setNowSeconds] = useState(() =>
    Math.floor(Date.now() / 1000),
  );
  const [slowTooltipUntil, setSlowTooltipUntil] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const value = editing ? editText : text;
  const canSendPlain = profile?.canSendPlain ?? true;
  const canPost = profile?.canSend ?? true;
  const readOnly = readOnlyProp ?? (!canSendPlain || !canPost);
  const canSendStickers = profile?.canSendStickers ?? true;
  const canSendGifs = profile?.canSendGifs ?? true;
  const canOpenPicker = canSendPlain || canSendStickers || canSendGifs;
  const canAttach = canPost && (profile?.canSendMedia ?? true);
  const slowConfigured = profile?.slowModeSeconds ?? 0;
  const slowNextSend = profile?.slowModeNextSendDate ?? 0;
  const slowRemaining = slowNextSend > nowSeconds ? slowNextSend - nowSeconds : 0;
  const slowBlocked = slowRemaining > 0;
  const slowTooltipVisible =
    slowBlocked && slowTooltipUntil > Date.now();
  // Web K never changes the placeholder for reply/edit; it follows the chat
  // capability only (input.ts:3656-3732).
  const placeholderText = t(
    PLACEHOLDER_KEYS[
      placeholderKind ??
        (isChannelChat(chat, profile) ? "broadcast" : "message")
    ],
  );

  const updateValue = (next: string) => {
    if (commandMenuOpen && next !== "" && !next.startsWith("/")) {
      setCommandMenuOpen(false);
    }
    if (editing) {
      setEditText(next);
    } else {
      setText(next);
    }
    if (next.length > 0) {
      onTyping?.();
    } else {
      onTypingStop?.();
    }
  };

  // Drafts stay local (same key as before the redesign).
  useEffect(() => {
    setText(localStorage.getItem(draftKey) ?? "");
  }, [draftKey]);

  useEffect(() => {
    if (!chatId) {
      return;
    }
    if (text.trim()) {
      localStorage.setItem(draftKey, text);
    } else {
      localStorage.removeItem(draftKey);
    }
  }, [chatId, draftKey, text]);

  useEffect(() => {
    setEditText(editing?.text ?? "");
    if (editing) {
      inputRef.current?.focus();
    }
  }, [editing]);

  useEffect(() => {
    if (replyingTo) {
      inputRef.current?.focus();
    }
  }, [replyingTo]);

  // Autosize up to the Web K plate maximum (30rem); the CSS caps and scrolls.
  useEffect(() => {
    const node = inputRef.current;
    if (!node) {
      return;
    }
    node.style.height = "0px";
    node.style.height = `${node.scrollHeight}px`;
  }, [value]);

  // Slow mode countdown ticks once a second while the chat has slow mode or
  // its tooltip is visible.
  useEffect(() => {
    if (!slowConfigured && !slowTooltipUntil) {
      return;
    }
    setNowSeconds(Math.floor(Date.now() / 1000));
    const id = window.setInterval(() => {
      setNowSeconds(Math.floor(Date.now() / 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, [slowConfigured, slowNextSend, slowTooltipUntil]);

  // The slow-mode tooltip hides by itself, matching Web K's auto tooltip
  // (showSlowModeTooltipIfNeeded auto: true, input.ts:4706-4774).
  useEffect(() => {
    if (!slowTooltipUntil) {
      return;
    }
    const id = window.setTimeout(
      () => setSlowTooltipUntil(0),
      Math.max(0, slowTooltipUntil - Date.now()),
    );
    return () => window.clearTimeout(id);
  }, [slowTooltipUntil]);

  // Close the attach / command popovers when the pointer leaves them.
  useEffect(() => {
    if (!attachMenuOpen && !commandMenuOpen) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      if (
        target.closest(
          "[data-composer-popover], [data-composer-popover-trigger]",
        )
      ) {
        return;
      }
      setAttachMenuOpen(false);
      setCommandMenuOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [attachMenuOpen, commandMenuOpen]);

  // Escape closes the popovers even when focus is outside the textarea.
  useEffect(() => {
    if (!attachMenuOpen && !commandMenuOpen) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setAttachMenuOpen(false);
        setCommandMenuOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [attachMenuOpen, commandMenuOpen]);

  // Bot command autocomplete (/typed at the message start, or the menu toggle).
  const allCommands = (profile?.botCommands ?? EMPTY_COMMANDS) as ComposerBotCommand[];
  const query = editing ? null : commandQuery(value);
  const autocompleteEnabled = canAutocompleteCommands(chat, profile);
  const menuCommands = useMemo(() => {
    if (commandMenuOpen) {
      return filterBotCommands(allCommands, query ?? "") as ComposerBotCommand[];
    }
    if (query === null || !autocompleteEnabled) {
      return EMPTY_COMMANDS;
    }
    return filterBotCommands(allCommands, query) as ComposerBotCommand[];
  }, [allCommands, autocompleteEnabled, commandMenuOpen, query]);
  const showCommands =
    menuCommands.length > 0 &&
    (commandMenuOpen ||
      (query !== null && autocompleteEnabled && !autocompleteSuppressed));

  useEffect(() => {
    setCommandIndex(0);
  }, [query, commandMenuOpen]);

  useEffect(() => {
    setAutocompleteSuppressed(false);
  }, [query]);

  useEffect(() => {
    setCommandIndex((current) =>
      current < menuCommands.length ? current : 0,
    );
  }, [menuCommands.length]);

  const showSlowModeTooltip = () => {
    setSlowTooltipUntil(Date.now() + Math.min(4000, Math.max(1500, slowRemaining * 1000)));
  };

  const submit = async () => {
    if (sending) {
      return;
    }
    if (readOnly) {
      onToast(t("input.sendRestricted"));
      return;
    }
    if (slowBlocked) {
      // Web K keeps the send button enabled: pressing it shows the slow-mode
      // tooltip with the live countdown instead of sending (input.ts:4706).
      showSlowModeTooltip();
      return;
    }
    const next = value.trim();
    if (!next) {
      return;
    }
    setSending(true);
    try {
      await onSend(next);
      if (editing) {
        setEditText("");
      } else {
        setText("");
      }
      inputRef.current?.focus();
    } catch {
      onToast(t(editing ? "input.editFailed" : "input.sendFailed"));
    } finally {
      setSending(false);
    }
  };

  const attach = async () => {
    if (attaching || sending) {
      return;
    }
    if (!canAttach) {
      onToast(t("input.sendRestricted"));
      return;
    }
    setAttachMenuOpen(false);
    setAttaching(true);
    try {
      const sent = await onAttach(editing ? "" : text.trim());
      if (sent) {
        setText("");
        inputRef.current?.focus();
      }
    } catch {
      onToast(t("input.attachFailed"));
    } finally {
      setAttaching(false);
    }
  };

  const runCommand = async (command: ComposerBotCommand) => {
    // Groups insert "/command@botusername" (commandsHelper.ts:24-30).
    const payload = commandInsertText(command, chat, profile);
    setCommandMenuOpen(false);
    setSending(true);
    try {
      if (onSendCommand) {
        await onSendCommand(payload);
      } else {
        await onSend(payload);
      }
      if (editing) {
        setEditText("");
      } else {
        setText("");
      }
      inputRef.current?.focus();
    } catch {
      onToast(t("input.sendFailed"));
    } finally {
      setSending(false);
    }
  };

  const insertEmoji = (emoji: string) => {
    const node = inputRef.current;
    if (!node) {
      return;
    }
    const result = insertEmojiAtCursor(node, emoji);
    updateValue(result.value);
    // Keep the picker open for multiple picks (Web K) but keep typing possible.
    restoreCaret(node, result.caret);
  };

  const openEmojiPicker = () => {
    setPickerOpen((open) => !open);
    setAttachMenuOpen(false);
    setCommandMenuOpen(false);
    setAutocompleteSuppressed(true);
  };

  const openAttachMenu = () => {
    if (attaching || sending) {
      return;
    }
    if (!canAttach) {
      onToast(t("input.sendRestricted"));
      return;
    }
    setAttachMenuOpen((open) => !open);
    setPickerOpen(false);
    setCommandMenuOpen(false);
    setAutocompleteSuppressed(true);
  };

  const toggleCommandList = () => {
    setCommandMenuOpen((open) => !open);
    setAttachMenuOpen(false);
    setPickerOpen(false);
    setAutocompleteSuppressed(true);
    inputRef.current?.focus();
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Escape") {
      if (pickerOpen) {
        event.preventDefault();
        event.stopPropagation();
        setPickerOpen(false);
        return;
      }
      if (attachMenuOpen || commandMenuOpen) {
        event.preventDefault();
        event.stopPropagation();
        setAttachMenuOpen(false);
        setCommandMenuOpen(false);
        return;
      }
      if (query !== null && autocompleteEnabled && !autocompleteSuppressed) {
        event.preventDefault();
        event.stopPropagation();
        setAutocompleteSuppressed(true);
        return;
      }
      if (editing || replyingTo) {
        event.preventDefault();
        onCancelContext();
        return;
      }
      return;
    }

    if (
      showCommands &&
      (event.key === "ArrowDown" || event.key === "ArrowUp")
    ) {
      event.preventDefault();
      setCommandIndex((current) => {
        const count = menuCommands.length;
        if (count === 0) {
          return 0;
        }
        return event.key === "ArrowDown"
          ? (current + 1) % count
          : (current - 1 + count) % count;
      });
      return;
    }

    if (
      showCommands &&
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      const target = menuCommands[commandIndex] ?? menuCommands[0];
      if (target) {
        void runCommand(target);
      }
      return;
    }

    if (event.key !== "Enter" || event.shiftKey) {
      return;
    }
    // IME composition must never trigger a send.
    if (event.nativeEvent.isComposing) {
      return;
    }
    const modifier = event.ctrlKey || event.metaKey;
    const shouldSend = enterToSend ? !modifier : modifier;
    if (!shouldSend) {
      return;
    }
    event.preventDefault();
    void submit();
  };

  const textEmpty = value.trim().length === 0;
  const mode: SendButtonMode = sending
    ? "loading"
    : editing
      ? "edit"
      : textEmpty && !upload
        ? "voice"
        : "send";
  // Slow mode never disables the button in Web K; only an empty/invalid state
  // does (the field itself is read-only when text posting is banned).
  const sendDisabled =
    sending ||
    (mode === "send" && textEmpty) ||
    (mode === "edit" && textEmpty);
  const sendLabel = sending
    ? t("input.sending")
    : mode === "edit"
      ? t("input.saveEdit")
      : mode === "send"
        ? t("input.send")
        : t("input.recordVoice");

  const botMenu = profile?.botMenuButton;
  const showBotPill = botMenu?.type === "webapp";
  // Telegram Web K only puts the command-list menu button in front of the
  // composer in a private bot chat and only while the field is empty
  // (input.ts:3620-3625); groups still autocomplete "/" while typing.
  const isPrivateBotChat =
    chat?.kind === "private" && (Boolean(chat?.bot) || profile?.type === "bot");
  const showCommandsToggle =
    isPrivateBotChat &&
    !editing &&
    textEmpty &&
    Boolean(allCommands.length) &&
    botMenu?.type !== "webapp";
  const attachingLabel = attaching
    ? t("input.attaching")
    : canPost
      ? t("input.attach")
      : t("input.textNotAllowed");

  const commandAvatar = (command: ComposerBotCommand) => {
    if (chat && isBotChat(chat, profile)) {
      return {
        title: chat.title,
        initials: chat.initials,
        color: chat.color,
        seed: chat.id,
        photo: chat.avatarUrl,
      };
    }
    const name = command.botUsername || "bot";
    const initials =
      name
        .replace(/[^A-Za-z0-9_]/g, "")
        .slice(0, 2)
        .toUpperCase() || "B";
    return { title: name, initials, color: chatColor(name), seed: name, photo: undefined };
  };

  const clickSend = () => {
    setAttachMenuOpen(false);
    setCommandMenuOpen(false);
    if (mode === "voice") {
      if (readOnly) {
        onToast(t("input.sendRestricted"));
      } else {
        onToast(t("input.voiceSoon"));
      }
      return;
    }
    void submit();
  };

  return (
    <div
      className="tg-composer"
      data-busy={busy ? true : undefined}
      data-editing={editing ? true : undefined}
      data-reply={replyingTo ? true : undefined}
      data-control={control ? true : undefined}
    >
      <div className="tg-composer__lane">
        <div className="tg-composer__anchor" data-emoji-picker-anchor>
          <div className="tg-composer__plate" data-mode={control ? "control" : "compose"}>
            <div className="tg-composer__rows" aria-hidden={control ? true : undefined}>
              <ComposerReplyBar
                replyingTo={replyingTo}
                editing={editing}
                onCancel={onCancelContext}
              />
              {upload ? <ComposerUploadRow upload={upload} /> : null}
              <div className="tg-composer__row">
                {showBotPill ? (
                  <BotMenuPill
                    text={botMenu?.text || t("input.botMenu")}
                    onClick={() => {
                      setAttachMenuOpen(false);
                      setCommandMenuOpen(false);
                      setPickerOpen(false);
                      if (onOpenBotMenu) {
                        onOpenBotMenu();
                      } else {
                        onToast(t("input.botMenuUnavailable"));
                      }
                    }}
                  />
                ) : null}
                {showCommandsToggle ? (
                  <ComposerButton
                    className="tg-composer__icon tg-composer__commands-toggle"
                    data-active={commandMenuOpen ? true : undefined}
                    data-composer-popover-trigger
                    aria-label={t("input.botCommands")}
                    aria-haspopup="listbox"
                    aria-expanded={showCommands}
                    title={t("input.botCommands")}
                    onClick={toggleCommandList}
                  >
                    <span
                      className="tg-composer__menu-icon"
                      data-back={commandMenuOpen ? true : undefined}
                      aria-hidden="true"
                    />
                  </ComposerButton>
                ) : null}
                <ComposerButton
                  className="tg-composer__icon"
                  data-composer-popover-trigger
                  data-disabled={!canAttach ? true : undefined}
                  aria-label={attachingLabel}
                  aria-haspopup="menu"
                  aria-expanded={attachMenuOpen}
                  title={attachingLabel}
                  disabled={attaching || sending || !canAttach}
                  onClick={openAttachMenu}
                >
                  <Icon name="attach_file" size={24} />
                </ComposerButton>
                <textarea
                  ref={inputRef}
                  className="tg-composer-input tg-composer__input"
                  rows={1}
                  value={value}
                  readOnly={readOnly}
                  placeholder={placeholderText}
                  aria-label={placeholderText}
                  aria-busy={busy || sending ? true : undefined}
                  title={readOnly ? t("input.textNotAllowed") : undefined}
                  onChange={(event) => updateValue(event.target.value)}
                  onKeyDown={handleKeyDown}
                  onClick={() => {
                    setAttachMenuOpen(false);
                    setCommandMenuOpen(false);
                    if (readOnly) {
                      onToast(t("input.sendRestricted"));
                    }
                  }}
                />
                <ComposerButton
                  className="tg-composer__icon"
                  data-active={pickerOpen ? true : undefined}
                  aria-label={t("input.emoji")}
                  aria-haspopup="dialog"
                  aria-expanded={pickerOpen}
                  title={t("input.emoji")}
                  disabled={!canOpenPicker}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={openEmojiPicker}
                >
                  <Icon name="mood" size={24} />
                </ComposerButton>
                <SendButton
                  mode={mode}
                  label={sendLabel}
                  title={slowTooltipVisible ? undefined : sendLabel}
                  disabled={sendDisabled}
                  onClick={clickSend}
                />
              </div>
            </div>
            {control ? <div className="tg-composer__control">{control}</div> : null}
          </div>
          {slowTooltipVisible ? (
            <div className="tg-composer__slow-tooltip" role="status">
              {t("input.slowModeHint", { timer: formatSlowTimer(slowRemaining) })}
            </div>
          ) : null}
          {attachMenuOpen ? (
            <AttachMenu
              canSendMedia={canAttach}
              onPick={() => {
                void attach();
              }}
            />
          ) : null}
          {showCommands ? (
            <BotCommandMenu
              commands={menuCommands}
              activeIndex={commandIndex}
              label={t("input.botCommands")}
              getAvatar={commandAvatar}
              onHover={setCommandIndex}
              onSelect={(command) => {
                void runCommand(command as ComposerBotCommand);
              }}
            />
          ) : null}
          <EmojiPicker
            open={pickerOpen}
            onOpenChange={setPickerOpen}
            onPick={insertEmoji}
            onToast={onToast}
            network={network}
            onSendSticker={onSendSticker}
            onSendGif={onSendGif}
            onSendInlineGif={onSendInlineGif}
            canSendStickers={canSendStickers}
            canSendGifs={canSendGifs}
            initialTab={canSendPlain ? undefined : "stickers"}
          />
        </div>
      </div>
    </div>
  );
}
