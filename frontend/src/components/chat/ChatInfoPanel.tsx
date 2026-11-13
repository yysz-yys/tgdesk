import { useEffect, useMemo, useState } from "react";
import { Browser } from "@wailsio/runtime";
import { useTranslation } from "react-i18next";
import type { Chat, ChatMember, Message } from "../../types";
import { Avatar, Icon, IconButton, Spinner } from "../../ui";
import { chatColor, chatInitials } from "../../data/telegram";
import { ChatAvatar } from "./ChatAvatar";
import { MediaThumb } from "./MediaThumb";

interface ChatInfoPanelProps {
  chat: Chat;
  messages: Message[];
  onClose: () => void;
  onTogglePin: (id: string) => void;
  onToggleMute: (id: string) => void;
  onMarkRead: (id: string) => void;
  onLoadMembers: (chatID: string) => Promise<ChatMember[]>;
  onOpenPhoto?: (message: Message) => void;
  onToast: (message: string) => void;
}

type InfoTab = "members" | "media" | "links";

const visualMedia = new Set(["photo", "video", "animation", "video_note"]);
const urlPattern = /https?:\/\/[^\s<>"']+/g;

function trimUrl(value: string) {
  return value.replace(/[),.;!?]+$/u, "");
}

function linkLabel(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./u, "");
  } catch {
    return value;
  }
}

/** Right-hand chat info pane: hero, actions and members/media/links tabs. */
export function ChatInfoPanel({
  chat,
  messages,
  onClose,
  onTogglePin,
  onToggleMute,
  onMarkRead,
  onLoadMembers,
  onOpenPhoto,
  onToast,
}: ChatInfoPanelProps) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<InfoTab>(
    chat.kind === "private" ? "media" : "members",
  );
  const [members, setMembers] = useState<ChatMember[] | null>(null);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersFailed, setMembersFailed] = useState(false);

  const handle = chat.username?.replace(/^@/, "");
  const kind = t(
    chat.kind === "private"
      ? "rightPanel.privateChat"
      : chat.kind === "channel"
        ? "rightPanel.channel"
        : "rightPanel.group",
  );
  const subtitle =
    chat.kind === "private"
      ? chat.online
        ? t("chat.online")
        : t("chat.lastSeen")
      : (chat.members ?? kind);

  useEffect(() => {
    setTab(chat.kind === "private" ? "media" : "members");
  }, [chat.id, chat.kind]);

  useEffect(() => {
    if (chat.kind === "private") {
      return;
    }
    let cancelled = false;
    setMembers(null);
    setMembersFailed(false);
    setMembersLoading(true);
    void onLoadMembers(chat.id)
      .then((rows) => {
        if (!cancelled) {
          setMembers(rows);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMembersFailed(true);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setMembersLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [chat.id, chat.kind, onLoadMembers]);

  const media = useMemo(
    () =>
      messages.filter(
        (message) => message.media && visualMedia.has(message.media.kind),
      ),
    [messages],
  );

  const links = useMemo(() => {
    const seen = new Map<string, string>();
    if (handle) {
      const own = `https://t.me/${handle}`;
      seen.set(own, `t.me/${handle}`);
    }
    const add = (value?: string) => {
      if (!value) {
        return;
      }
      const url = trimUrl(value);
      if (!url || !/^https?:\/\//u.test(url) || seen.has(url)) {
        return;
      }
      seen.set(url, linkLabel(url));
    };
    for (const message of messages) {
      add(message.media?.url);
      for (const match of message.text?.matchAll(urlPattern) ?? []) {
        add(match[0]);
      }
    }
    return [...seen.entries()].map(([url, label]) => ({ url, label }));
  }, [handle, messages]);

  const copyLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      onToast(t("chatMenu.copied"));
    } catch {
      onToast(t("chat.clipboardError"));
    }
  };

  const tabs: InfoTab[] =
    chat.kind === "private" ? ["media", "links"] : ["members", "media", "links"];

  return (
    <aside className="f-info-panel" aria-label={t("rightPanel.chatInfo")}>
      <header className="f-info-head">
        <IconButton
          label={t("rightPanel.close")}
          icon="close"
          size="1"
          iconSize={17}
          onClick={onClose}
        />
        <span className="f-info-title">{t("rightPanel.chatInfo")}</span>
      </header>

      <div className="f-info-scroll">
        <div className="f-info-hero">
          <ChatAvatar chat={chat} size={84} />
          <h2>
            {chat.title}
            {chat.verified ? (
              <Icon
                name="verified"
                size={15}
                className="f-info-verified"
                label={t("chat.verified")}
              />
            ) : null}
          </h2>
          <p className={chat.online ? "f-info-sub f-info-online" : "f-info-sub"}>
            {chat.online ? <span className="f-online-dot" /> : null}
            {subtitle}
          </p>
        </div>

        <div className="f-info-actions">
          <button
            type="button"
            className="f-info-action"
            onClick={() => onToggleMute(chat.id)}
          >
            <Icon name={chat.muted ? "notifications" : "notifications_off"} size={19} />
            <span>{chat.muted ? t("chatMenu.unmute") : t("chatMenu.mute")}</span>
          </button>
          <button
            type="button"
            className="f-info-action"
            onClick={() => onTogglePin(chat.id)}
          >
            <Icon name="push_pin" size={19} />
            <span>{chat.pinned ? t("chatMenu.unpin") : t("chatMenu.pin")}</span>
          </button>
          <button
            type="button"
            className="f-info-action"
            disabled={!chat.unread}
            onClick={() => onMarkRead(chat.id)}
          >
            <Icon name="mark_email_read" size={19} />
            <span>{t("chatMenu.markRead")}</span>
          </button>
        </div>

        <div className="f-info-tabs" role="tablist">
          {tabs.map((item) => (
            <button
              type="button"
              key={item}
              role="tab"
              aria-selected={tab === item}
              data-active={tab === item || undefined}
              className="f-info-tab"
              onClick={() => setTab(item)}
            >
              {t(`rightPanel.${item}`)}
            </button>
          ))}
        </div>

        <div className="f-info-tab-body" role="tabpanel">
          {tab === "members" ? (
            membersLoading ? (
              <div className="f-info-status">
                <Spinner size={20} />
              </div>
            ) : membersFailed ? (
              <p className="f-info-empty">{t("rightPanel.membersFailed")}</p>
            ) : members && members.length > 0 ? (
              <div className="f-info-members">
                {members.map((member) => (
                  <div className="f-info-member" key={member.id}>
                    <Avatar
                      title={member.name}
                      initials={chatInitials(member.name)}
                      color={chatColor(member.id)}
                      photo={member.avatarUrl}
                      size={36}
                    />
                    <span className="f-info-member-copy">
                      <b>{member.name}</b>
                      <small>
                        {member.bot
                          ? t("rightPanel.bot")
                          : member.username
                            ? `@${member.username}`
                            : t("rightPanel.member")}
                      </small>
                    </span>
                    {member.admin ? (
                      <span className="f-info-role">{t("rightPanel.admin")}</span>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <p className="f-info-empty">{t("rightPanel.membersEmpty")}</p>
            )
          ) : null}

          {tab === "media" ? (
            media.length > 0 ? (
              <div className="f-info-media-grid">
                {media.map((message) => (
                  <span className="f-info-media-cell" key={message.id}>
                    {message.media?.kind === "photo" && message.media.photoUrl ? (
                      <button
                        type="button"
                        className="f-info-media-open"
                        aria-label={t("chat.openPhoto")}
                        onClick={() => onOpenPhoto?.(message)}
                      >
                        <MediaThumb
                          src={message.media.thumbUrl}
                          alt={message.media.name}
                          className="f-info-media-img"
                        />
                      </button>
                    ) : (
                      <MediaThumb
                        src={message.media?.thumbUrl}
                        alt={message.media?.name ?? ""}
                        className="f-info-media-img"
                      />
                    )}
                    {message.media?.kind === "video" ||
                    message.media?.kind === "video_note" ? (
                      <span className="f-info-media-badge">
                        <Icon name="play_arrow" size={14} />
                      </span>
                    ) : null}
                  </span>
                ))}
              </div>
            ) : (
              <p className="f-info-empty">{t("rightPanel.mediaEmpty")}</p>
            )
          ) : null}

          {tab === "links" ? (
            links.length > 0 ? (
              <div className="f-info-links">
                {links.map(({ url, label }) => (
                  <div className="f-info-link-row" key={url}>
                    <button
                      type="button"
                      className="f-info-link-main"
                      onClick={() => void Browser.OpenURL(url)}
                    >
                      <Icon name="link" size={15} />
                      <span className="f-info-link-copy">
                        <b>{label}</b>
                        <small>{url}</small>
                      </span>
                    </button>
                    <IconButton
                      label={t("chatMenu.copyLink")}
                      icon="content_copy"
                      size="1"
                      onClick={() => void copyLink(url)}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <p className="f-info-empty">{t("rightPanel.linksEmpty")}</p>
            )
          ) : null}
        </div>
      </div>
    </aside>
  );
}
