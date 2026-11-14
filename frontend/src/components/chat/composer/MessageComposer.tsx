import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import type {
  BotCommandInfo,
  Chat,
  ChatProfile,
  Message,
  UploadProgress,
} from "../../../types";
import { insertEmojiAtCursor, restoreCaret } from "../../../lib/emojiInsert";
import { Icon } from "../../../ui";
import { EmojiPicker } from "../EmojiPicker";
import { AttachMenu } from "./AttachMenu";
import { BotCommandMenu } from "./BotCommandMenu";
import { BotMenuPill } from "./BotMenuPill";
import { ComposerReplyBar } from "./ComposerReplyBar";
import { ComposerUploadRow } from "./ComposerUploadRow";
import { SendButton, type SendButtonMode } from "./SendButton";
import { SlowModeHint } from "./SlowModeHint";
import {
  canAutocompleteCommands,
  commandQuery,
  filterBotCommands,
  formatSlowTimer,
  isChannelChat,
  normalizeCommand,
} from "./model";

const EMPTY_COMMANDS: BotCommandInfo[] = [];
const DRAFT_PREFIX = "tgdesk.draft.";

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
  onCancelContext: () => void;
  onSend: (text: string) => Promise<void>;
  onAttach: (caption: string) => Promise<boolean>;
  onOpenBotMenu?: () => void;
  onSendCommand?: (command: string) => Promise<void>;
  onToast: (message: string) => void;
  /** Sticker/GIF picker: network params for the kernel RPCs. */
  network?: { proxy: string; ntp: string };
  onSendSticker?: (ref: string) => void | Promise<unknown>;
  onSendGif?: (ref: string) => void | Promise<unknown>;
}

/**
 * Telegram Web K message composer plate: reply/edit header and upload progress
 * are rows inside the same 24 px floating card, followed by the input row
 * (bot pill / attach / editor / slow-mode chip / emoji / morphing send-mic).
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
  onCancelContext,
  onSend,
  onAttach,
  onOpenBotMenu,
  onSendCommand,
  onToast,
  network,
  onSendSticker,
  onSendGif,
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
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const value = editing ? editText : text;
  const placeholder = editing
    ? t("input.editPlaceholder")
    : replyingTo
      ? t("input.replyPlaceholder")
      : isChannelChat(chat, profile)
        ? t("input.broadcast")
        : t("input.message");
  const canSendPlain = profile?.canSendPlain ?? true;
  const canSendStickers = profile?.canSendStickers ?? true;
  const canSendGifs = profile?.canSendGifs ?? true;
  const canOpenPicker =
    canSendPlain || canSendStickers || canSendGifs;
  const slowConfigured = profile?.slowModeSeconds ?? 0;
  const slowNextSend = profile?.slowModeNextSendDate ?? 0;
  const slowRemaining = slowNextSend > nowSeconds ? slowNextSend - nowSeconds : 0;
  const slowBlocked = slowRemaining > 0;
  const slowTitle = slowBlocked
    ? t("input.slowModeHint", { timer: formatSlowTimer(slowRemaining) })
    : undefined;

  const updateValue = (next: string) => {
    if (commandMenuOpen && next !== "" && !next.startsWith("/")) {
      setCommandMenuOpen(false);
    }
    if (editing) {
      setEditText(next);
    } else {
      setText(next);
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

  // Slow mode countdown ticks once a second while the chat has slow mode.
  useEffect(() => {
    if (!slowConfigured) {
      return;
    }
    setNowSeconds(Math.floor(Date.now() / 1000));
    const id = window.setInterval(() => {
      setNowSeconds(Math.floor(Date.now() / 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, [slowConfigured, slowNextSend]);

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
  const allCommands = profile?.botCommands;
  const query = editing ? null : commandQuery(value);
  const autocompleteEnabled = canAutocompleteCommands(chat, profile);
  const menuCommands = useMemo(() => {
    if (commandMenuOpen) {
      return filterBotCommands(allCommands, query ?? "");
    }
    if (query === null || !autocompleteEnabled) {
      return EMPTY_COMMANDS;
    }
    return filterBotCommands(allCommands, query);
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

  const submit = async () => {
    if (sending) {
      return;
    }
    if (slowBlocked) {
      onToast(t("input.slowModeError"));
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

  const runCommand = async (command: BotCommandInfo) => {
    const payload = `/${normalizeCommand(command.command)}`;
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
  const sendDisabled =
    sending ||
    !canSendPlain ||
    (mode === "send" && (textEmpty || slowBlocked)) ||
    (mode === "edit" && (textEmpty || slowBlocked));
  const sendLabel = sending
    ? t("input.sending")
    : mode === "edit"
      ? t("input.saveEdit")
      : mode === "send"
        ? slowBlocked
          ? t("input.slowMode")
          : t("input.send")
        : t("input.recordVoice");

  const botMenu = profile?.botMenuButton;
  const showBotPill = botMenu?.type === "webapp";
  // Telegram Web K only puts the command-list menu button in front of the
  // composer in a private bot chat; group chats still autocomplete "/" while
  // typing but have no toggle icon.
  const isPrivateBotChat =
    chat?.kind === "private" && (Boolean(chat?.bot) || profile?.type === "bot");
  const showCommandsToggle =
    isPrivateBotChat &&
    !editing &&
    Boolean(allCommands?.length) &&
    botMenu?.type !== "webapp";
  const attachingLabel = attaching ? t("input.attaching") : t("input.attach");

  const clickSend = () => {
    setAttachMenuOpen(false);
    setCommandMenuOpen(false);
    if (mode === "voice") {
      onToast(t("input.voiceSoon"));
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
    >
      <div className="tg-composer__lane">
        <div className="tg-composer__anchor" data-emoji-picker-anchor>
          <div className="tg-composer__plate">
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
                <button
                  type="button"
                  className="tg-composer__icon"
                  data-active={commandMenuOpen ? true : undefined}
                  data-composer-popover-trigger
                  aria-label={t("input.botCommands")}
                  aria-haspopup="listbox"
                  aria-expanded={showCommands}
                  title={t("input.botCommands")}
                  onClick={toggleCommandList}
                >
                  <Icon name="menu" size={22} />
                </button>
              ) : null}
              <button
                type="button"
                className="tg-composer__icon"
                data-composer-popover-trigger
                aria-label={attachingLabel}
                aria-haspopup="menu"
                aria-expanded={attachMenuOpen}
                title={attachingLabel}
                disabled={attaching || sending}
                onClick={openAttachMenu}
              >
                <Icon name="attach_file" size={22} />
              </button>
              <textarea
                ref={inputRef}
                className="tg-composer-input tg-composer__input"
                rows={1}
                value={value}
                readOnly={!canSendPlain}
                placeholder={placeholder}
                aria-label={placeholder}
                aria-busy={busy || sending ? true : undefined}
                title={!canSendPlain ? t("input.textNotAllowed") : undefined}
                onChange={(event) => updateValue(event.target.value)}
                onKeyDown={handleKeyDown}
                onClick={() => {
                  setAttachMenuOpen(false);
                  setCommandMenuOpen(false);
                  if (!canSendPlain) {
                    onToast(t("input.sendRestricted"));
                  }
                }}
              />
              <SlowModeHint
                configuredSeconds={slowConfigured}
                remainingSeconds={slowRemaining}
              />
              <button
                type="button"
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
                <Icon name="mood" size={22} />
              </button>
              <SendButton
                mode={mode}
                label={slowBlocked && mode !== "loading" ? slowTitle ?? sendLabel : sendLabel}
                title={slowTitle}
                disabled={sendDisabled}
                onClick={clickSend}
              />
            </div>
          </div>
          {attachMenuOpen ? (
            <AttachMenu
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
              onHover={setCommandIndex}
              onSelect={(command) => {
                void runCommand(command);
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
            canSendStickers={canSendStickers}
            canSendGifs={canSendGifs}
            initialTab={canSendPlain ? undefined : "stickers"}
          />
        </div>
      </div>
    </div>
  );
}
