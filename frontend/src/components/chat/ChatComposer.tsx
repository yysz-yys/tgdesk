import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { Chat, ChatProfile, Message, UploadProgress } from "../../types";
import { ChannelBar } from "./ChannelBar";
import { MessageComposer } from "./composer/MessageComposer";
import { StartPlate } from "./composer/StartPlate";
import { ControlPlate } from "./composer/ControlPlate";
import { ComposerButton } from "./composer/ComposerButton";
import { isBotChat, resolveComposerState } from "./composer/model";
import "./composer/composer-f.css";

export interface ChatComposerProps {
  chatId: string;
  /** Full chat object; the capability switch needs its kind and bot flag. */
  chat?: Chat;
  /** Full peer profile (rights, slow mode, bot menu). Null while unavailable. */
  profile?: ChatProfile | null;
  /** True while the profile RPC is in flight (channel footer skeleton). */
  profileLoading?: boolean;
  /** False for a bot chat without history → Web K START plate. */
  hasMessages?: boolean;
  replyingTo?: Message | null;
  editing?: Message | null;
  upload?: UploadProgress;
  onCancelContext: () => void;
  onSend: (text: string) => Promise<void>;
  onAttach: (caption: string) => Promise<boolean>;
  onToast: (message: string) => void;
  enterToSend: boolean;
  /** Opens the bot menu Web App (Web K pill when the bot exposes one). */
  onOpenBotMenu?: () => void;
  /** Sends `/command` through the app's send path (fallback for commands). */
  onSendCommand?: (command: string) => Promise<void>;
  /** Calls messages.startBot for the START plate (optional until wired). */
  onStartBot?: (startParam?: string) => Promise<void> | void;
  /** JOIN / APPLY TO JOIN GROUP / SUBSCRIBE plate action (optional). */
  onJoinChat?: () => void;
  /** Unblock plate action for blocked private peers (optional). */
  onUnblock?: () => void;
  /** Server-side mute toggle for the channel footer. */
  onToggleMute?: () => void;
  /** Gift side button of the broadcast footer (not wired yet: toasts). */
  onSendGift?: () => void;
  /** Comments side button when a monoforum chat is linked (optional). */
  onOpenComments?: () => void;
  /** Typing-indicator signal, fired while the user edits the draft. */
  onTyping?: () => void;
  /** Typing signal cleared when the draft becomes empty. */
  onTypingStop?: () => void;
  /** Sticker/GIF picker: network params for the kernel RPCs. */
  network?: { proxy: string; ntp: string };
  onSendSticker?: (ref: string) => void | Promise<unknown>;
  onSendGif?: (ref: string) => void | Promise<unknown>;
  onSendInlineGif?: (queryId: number, resultId: string) => void | Promise<unknown>;
}

/**
 * Capability-based composer panel (Web K): the same floating plate renders the
 * writing rows or a control plate (START / JOIN / SUBSCRIBE / MUTE / Unblock)
 * and cross-fades between them in place. The decision ports tweb's
 * `haveSomethingInControl` chain (input.ts:3329-3458) and the placeholder
 * priority order (input.ts:3656-3732).
 */
export function ChatComposer({
  chatId,
  chat,
  profile,
  profileLoading,
  hasMessages = true,
  replyingTo,
  editing,
  upload,
  onCancelContext,
  onSend,
  onAttach,
  onToast,
  enterToSend,
  onOpenBotMenu,
  onSendCommand,
  onStartBot,
  onJoinChat,
  onUnblock,
  onToggleMute,
  onSendGift,
  onOpenComments,
  onTyping,
  onTypingStop,
  network,
  onSendSticker,
  onSendGif,
  onSendInlineGif,
}: ChatComposerProps) {
  const { t } = useTranslation();
  const bot = isBotChat(chat, profile);
  const state = resolveComposerState({ chat, profile, hasMessages });

  // While the channel profile loads there is no way to know whether this chat is
  // a posting admin or a subscriber; keep the footer lane reserved with the same
  // plate geometry instead of flashing the wrong composer.
  if (profileLoading && !profile && chat?.kind === "channel") {
    return (
      <div className="tg-composer tg-composer--skeleton">
        <div className="tg-composer__lane">
          <div className="tg-composer__plate tg-composer__plate--skeleton" />
        </div>
      </div>
    );
  }

  const startBot = async () => {
    try {
      if (onStartBot) {
        await onStartBot();
        return;
      }
      // Legacy fallback until the StartBot binding is wired: send "/start".
      if (onSendCommand) {
        await onSendCommand("/start");
      } else {
        await onSend("/start");
      }
    } catch {
      onToast(t("input.startFailed"));
    }
  };

  const join = () => {
    if (onJoinChat) {
      onJoinChat();
    } else {
      onToast(t("profileHome.comingSoon"));
    }
  };

  let control: ReactNode;
  switch (state.control) {
    case "start":
      control = (
        <StartPlate label={t("input.botStart")} onStart={() => void startBot()} />
      );
      break;
    case "unblock":
      control = (
        <ControlPlate
          center={
            <ComposerButton
              className="tg-composer__plate-button tg-composer__plate-button--transparent"
              onClick={() => {
                if (onUnblock) {
                  onUnblock();
                } else {
                  onToast(t("profileHome.comingSoon"));
                }
              }}
            >
              {t("input.unblock")}
            </ComposerButton>
          }
        />
      );
      break;
    case "mute":
      control = chat ? (
        <ChannelBar
          chat={chat}
          onToast={onToast}
          profile={profile}
          onToggleMute={onToggleMute}
          showGift={state.showGift}
          onSendGift={onSendGift}
          onOpenComments={onOpenComments}
        />
      ) : null;
      break;
    case "join":
    case "apply":
    case "subscribe": {
      const label =
        state.control === "join"
          ? t("input.join")
          : state.control === "apply"
            ? t("input.applyToJoin")
            : t("input.subscribe");
      control = (
        <ControlPlate
          center={
            <ComposerButton
              className="tg-composer__plate-button tg-composer__plate-button--primary"
              onClick={join}
            >
              {label}
            </ComposerButton>
          }
        />
      );
      break;
    }
    default:
      control = undefined;
  }

  return (
    <MessageComposer
      chatId={chatId}
      chat={chat}
      profile={profile}
      busy={profileLoading || (bot && !profile)}
      replyingTo={replyingTo}
      editing={editing}
      upload={upload}
      enterToSend={enterToSend}
      placeholder={state.placeholder}
      readOnly={state.readOnly}
      control={control}
      onCancelContext={onCancelContext}
      onSend={onSend}
      onAttach={onAttach}
      onOpenBotMenu={onOpenBotMenu}
      onSendCommand={onSendCommand}
      onToast={onToast}
      onTyping={onTyping}
      onTypingStop={onTypingStop}
      network={network}
      onSendSticker={onSendSticker}
      onSendGif={onSendGif}
      onSendInlineGif={onSendInlineGif}
    />
  );
}
