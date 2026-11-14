import { useTranslation } from "react-i18next";
import type { Chat, ChatProfile, Message, UploadProgress } from "../../types";
import { ChannelBar } from "./ChannelBar";
import { MessageComposer } from "./composer/MessageComposer";
import { MessagingDisabledBar } from "./composer/MessagingDisabledBar";
import { StartPlate } from "./composer/StartPlate";
import { isBotChat, isChannelChat } from "./composer/model";
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
  /** Sends `/command` (and `/start`) through the app's send path. */
  onSendCommand?: (command: string) => Promise<void>;
  /** Server-side mute toggle for the channel footer. */
  onToggleMute?: () => void;
  /** Sticker/GIF picker: network params for the kernel RPCs. */
  network?: { proxy: string; ntp: string };
  onSendSticker?: (ref: string) => void | Promise<unknown>;
  onSendGif?: (ref: string) => void | Promise<unknown>;
}

/**
 * Capability-based composer panel (Web K): writeable chats get the message
 * plate, broadcast channels without posting rights get the mute/unmute footer,
 * restricted chats get a read-only bar and never-started bots get START.
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
  onToggleMute,
  network,
  onSendSticker,
  onSendGif,
}: ChatComposerProps) {
  const { t } = useTranslation();
  const channel = isChannelChat(chat, profile);
  const bot = isBotChat(chat, profile);
  const restricted = profile != null && !profile.canSend;

  if (restricted) {
    // Broadcast channels replace the composer with the Web K mute footer (§7).
    if (channel && chat) {
      return (
        <ChannelBar
          chat={chat}
          onToast={onToast}
          onToggleMute={onToggleMute}
          profile={profile}
        />
      );
    }
    return (
      <MessagingDisabledBar
        text={t("input.sendRestricted")}
        hint={t("input.textNotAllowed")}
      />
    );
  }

  if (bot && hasMessages === false) {
    const start = async () => {
      try {
        if (onSendCommand) {
          await onSendCommand("/start");
        } else {
          await onSend("/start");
        }
      } catch {
        onToast(t("input.startFailed"));
      }
    };
    return (
      <StartPlate label={t("input.botStart")} onStart={() => void start()} />
    );
  }

  // While the channel profile loads, keep the footer lane reserved with the same
  // plate geometry instead of flashing a composer that may turn into a mute bar.
  if (profileLoading && !profile && chat?.kind === "channel") {
    return (
      <div className="tg-composer tg-composer--skeleton" aria-hidden="true">
        <div className="tg-composer__lane">
          <div className="tg-composer__plate tg-composer__plate--skeleton" />
        </div>
      </div>
    );
  }

  return (
    <MessageComposer
      chatId={chatId}
      chat={chat}
      profile={profile}
      busy={profileLoading}
      replyingTo={replyingTo}
      editing={editing}
      upload={upload}
      enterToSend={enterToSend}
      onCancelContext={onCancelContext}
      onSend={onSend}
      onAttach={onAttach}
      onOpenBotMenu={onOpenBotMenu}
      onSendCommand={onSendCommand}
      onToast={onToast}
      network={network}
      onSendSticker={onSendSticker}
      onSendGif={onSendGif}
    />
  );
}
