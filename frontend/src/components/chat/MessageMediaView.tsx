import { useEffect, useRef, useState } from "react";
import type { CSSProperties, MouseEvent, ReactNode } from "react";
import { Browser } from "@wailsio/runtime";
import type { DownloadTask, Message, MessageMedia } from "../../types";
import { Icon } from "../../ui";
import { captureViewerSource, type ViewerSource } from "../media/types";
import { DownloadBadge } from "./DownloadBadge";
import { MediaThumb } from "./MediaThumb";
import { LocationPreview } from "./LocationPreview";

interface MessageMediaViewProps {
  message: Message;
  album?: Message[];
  onOpenPhoto?: (message: Message, source?: ViewerSource) => void;
  onPlayVideo?: (message: Message, source?: ViewerSource) => void;
  onToast?: (message: string) => void;
  downloads?: Map<number, DownloadTask>;
  onDownloadInline?: (ids: number[]) => void;
  onOpenDownloaded?: (task: DownloadTask) => void;
  onPauseDownload?: (task: DownloadTask) => void;
  onResumeDownload?: (task: DownloadTask) => void;
}

const BLEED_KINDS = new Set(["photo", "video", "video_note", "animation"]);

export function isBleedMedia(media?: MessageMedia) {
  return Boolean(media && BLEED_KINDS.has(media.kind));
}

function aspectFor(media: MessageMedia, widePortrait = false): {
  width: string;
  ratio?: string;
  height: number;
  widthPx: number;
  portrait: boolean;
} {
  if (!media.width || !media.height) {
    return {
      width: "min(420px, 68vw)",
      ratio: "4 / 3",
      height: 315,
      widthPx: 420,
      portrait: false,
    };
  }
  const ratio = media.width / media.height;
  if (!Number.isFinite(ratio) || ratio <= 0) {
    return {
      width: "min(420px, 68vw)",
      ratio: "4 / 3",
      height: 315,
      widthPx: 420,
      portrait: false,
    };
  }
  const mediaRatio = Math.max(0.45, Math.min(2.4, ratio));
  if (!widePortrait) {
    const width = Math.round(Math.max(160, Math.min(420, 420 * mediaRatio)));
    return {
      width: `min(${width}px, 68vw)`,
      ratio: `${mediaRatio}`,
      height: Math.round(width / mediaRatio),
      widthPx: width,
      portrait: mediaRatio < 1,
    };
  }
  // Portrait media gets the wide, blurred-backdrop frame used by Telegram Web
  // instead of a narrow intrinsic strip; landscape media keeps its ratio.
  const bubbleRatio = mediaRatio < 1 ? 1 : mediaRatio;
  return {
    width: "min(420px, 68vw)",
    ratio: `${bubbleRatio}`,
    height: Math.round(420 / bubbleRatio),
    widthPx: 420,
    portrait: mediaRatio < 1,
  };
}

export function MessageMediaView({
  message,
  album,
  onOpenPhoto,
  onPlayVideo,
  onToast,
  downloads,
  onDownloadInline,
  onOpenDownloaded,
  onPauseDownload,
  onResumeDownload,
}: MessageMediaViewProps) {
  const media = message.media;
  const downloadBadge = (
    id: number,
    variant: "corner" | "file" = "corner",
  ): ReactNode => (
    <DownloadBadge
      asSpan
      variant={variant}
      messageID={id}
      task={downloads?.get(id)}
      onStart={onDownloadInline}
      onOpen={onOpenDownloaded}
      onPause={onPauseDownload}
      onResume={onResumeDownload}
    />
  );
  if (album && album.length > 1) {
    return (
      <AlbumGrid
        items={album}
        onOpenPhoto={onOpenPhoto}
        onPlayVideo={onPlayVideo}
        downloads={downloads}
        onDownloadInline={onDownloadInline}
        onOpenDownloaded={onOpenDownloaded}
        onPauseDownload={onPauseDownload}
        onResumeDownload={onResumeDownload}
      />
    );
  }
  if (!media) {
    return null;
  }

  switch (media.kind) {
    case "photo":
      return (
        <PhotoCard
          media={media}
          mediaId={message.id}
          label="Photo"
          downloadBadge={downloadBadge(message.id)}
          onClick={(element) =>
            onOpenPhoto?.(
              message,
              captureViewerSource(element, media.thumbUrl || media.photoUrl),
            )
          }
        />
      );
    case "video":
    case "video_note":
      return (
        <VideoCard
          media={media}
          mediaId={message.id}
          round={media.kind === "video_note"}
          downloadBadge={downloadBadge(message.id)}
          onClick={(element) =>
            onPlayVideo?.(message, captureViewerSource(element, media.thumbUrl))
          }
        />
      );
    case "animation":
      return (
        <AnimationCard
          media={media}
          mediaId={message.id}
          downloadBadge={downloadBadge(message.id)}
          onClick={(element) =>
            onPlayVideo?.(message, captureViewerSource(element, media.thumbUrl))
          }
        />
      );
    case "sticker":
      return <StickerView media={media} />;
    case "voice":
      return <VoicePlayer media={media} />;
    case "audio":
      return <AudioPlayer media={media} />;
    case "webpage":
      return <WebpageCard media={media} onToast={onToast} />;
    case "poll":
      return <PollCard media={media} />;
    case "location":
    case "venue":
      return <LocationCard media={media} />;
    case "contact":
      return <ContactCard media={media} />;
    case "dice":
      return <DiceCard media={media} />;
    case "game":
      return (
        <RichCard
          icon="sports_esports"
          title={media.title || media.name}
          description={media.description}
          accent={media.color}
          footer="Game"
        />
      );
    case "invoice":
      return (
        <RichCard
          icon="receipt_long"
          title={media.title || media.name}
          description={media.description}
          accent={media.color}
          footer={formatAmount(media)}
        />
      );
    case "story":
      return (
        <RichCard
          icon="auto_awesome"
          title="Story"
          description={media.description || `Story #${media.storyId ?? ""}`}
          accent="linear-gradient(135deg, #8b5cf6, #ec4899)"
          footer="Tap to open in Telegram"
        />
      );
    case "giveaway":
      return (
        <RichCard
          icon="redeem"
          title={media.name}
          description={
            media.description ||
            [
              media.quantity ? `${media.quantity} prize${media.quantity === 1 ? "" : "s"}` : "",
              media.months ? `${media.months} months Premium` : "",
            ]
              .filter(Boolean)
              .join(" · ")
          }
          accent={media.color}
          footer={media.untilDate ? `Ends ${formatDate(media.untilDate)}` : undefined}
        />
      );
    case "paid":
      return (
        <RichCard
          icon="paid"
          title={`${media.paidCount ?? 1} paid media`}
          description={`${formatStars(media.amount)} Telegram Stars`}
          accent={media.color}
          footer="Locked media"
          locked
        />
      );
    case "checklist":
      return <ChecklistCard media={media} />;
    case "unsupported":
      return (
        <div className="g-unsupported">
          <Icon name="help" size={18} />
          <span>{media.name || "Unsupported message"}</span>
        </div>
      );
    default:
      return (
        <FileCard
          media={media}
          downloadBadge={downloadBadge(message.id, "file")}
          onDownload={() => onDownloadInline?.([message.id])}
        />
      );
  }
}

function PhotoCard({
  media,
  mediaId,
  label,
  downloadBadge,
  onClick,
}: {
  media: MessageMedia;
  mediaId: number;
  label: string;
  downloadBadge?: ReactNode;
  onClick?: (element?: HTMLElement) => void;
}) {
  const layout = aspectFor(media);
  const [revealed, setRevealed] = useState(false);
  const imageSrc = media.photoUrl || media.thumbUrl;
  const backdropSrc = media.thumbUrl || media.photoUrl;
  return (
    <button
      type="button"
      className="g-media-card g-media-photo"
      data-media-id={mediaId}
      data-portrait={layout.portrait || undefined}
      style={
        {
          width: layout.width,
          aspectRatio: layout.ratio,
          "--media-height": `${layout.height}px`,
          "--media-bubble-ratio": layout.portrait ? "1" : layout.ratio,
          "--media-min-width": `${layout.widthPx}px`,
        } as CSSProperties
      }
      aria-label={label}
      onClick={(event) => {
        if (media.spoiler && !revealed) {
          setRevealed(true);
          return;
        }
        onClick?.(event.currentTarget);
      }}
    >
      <span
        className="g-media-backdrop"
        style={backdropSrc ? { backgroundImage: `url("${backdropSrc}")` } : undefined}
        aria-hidden="true"
      />
      <MediaThumb
        src={imageSrc}
        fallbackSrc={media.photoUrl && media.thumbUrl ? media.thumbUrl : undefined}
        alt={media.name}
        className="g-media-thumb g-media-main"
      />
      {downloadBadge}
      {media.spoiler && !revealed ? <span className="g-media-spoiler">Spoiler</span> : null}
    </button>
  );
}

function VideoCard({
  media,
  mediaId,
  round,
  downloadBadge,
  onClick,
}: {
  media: MessageMedia;
  mediaId: number;
  round?: boolean;
  downloadBadge?: ReactNode;
  onClick?: (element?: HTMLElement) => void;
}) {
  const layout = aspectFor(media);
  return (
    <button
      type="button"
      className={round ? "g-media-card g-video-note" : "g-media-card g-media-video"}
      data-media-id={mediaId}
      style={round ? undefined : { width: layout.width, aspectRatio: layout.ratio }}
      aria-label="Play video"
      onClick={(event) => onClick?.(event.currentTarget)}
    >
      <MediaThumb src={media.thumbUrl} alt={media.name} />
      <span className="g-media-play" aria-hidden="true">
        <Icon name="play_arrow" size={22} filled />
      </span>
      {downloadBadge}
      {media.duration ? (
        <span className="g-media-duration">{formatDuration(media.duration)}</span>
      ) : null}
      {media.spoiler ? <span className="g-media-spoiler">Spoiler</span> : null}
    </button>
  );
}

function AnimationCard({
  media,
  mediaId,
  downloadBadge,
  onClick,
}: {
  media: MessageMedia;
  mediaId: number;
  downloadBadge?: ReactNode;
  onClick?: (element?: HTMLElement) => void;
}) {
  const layout = aspectFor(media);
  return (
    <button
      type="button"
      className="g-media-card g-media-animation"
      data-media-id={mediaId}
      style={{ width: layout.width, aspectRatio: layout.ratio }}
      aria-label="Open GIF"
      onClick={(event) => onClick?.(event.currentTarget)}
    >
      <LazyVideo src={media.streamUrl} poster={media.thumbUrl} />
      {downloadBadge}
      <span className="g-media-badge">GIF</span>
    </button>
  );
}

function StickerView({ media }: { media: MessageMedia }) {
  const ext = (media.ext || "").toUpperCase();
  if (ext === "TGS" && media.streamUrl) {
    return <TgsSticker src={media.streamUrl} poster={media.thumbUrl} alt={media.emoji || "Sticker"} />;
  }
  if ((ext === "WEBM" || media.mime === "video/webm") && media.streamUrl) {
    return (
      <div className="g-sticker" data-video="true">
        <LazyVideo src={media.streamUrl} poster={media.thumbUrl} loop />
      </div>
    );
  }
  return (
    <div className="g-sticker">
      <MediaThumb src={media.photoUrl || media.thumbUrl} alt={media.emoji || "Sticker"} />
    </div>
  );
}

function TgsSticker({
  src,
  poster,
  alt,
}: {
  src: string;
  poster?: string;
  alt: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<{ destroy: () => void; play: () => void; pause: () => void } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || failed) {
      return;
    }
    let cancelled = false;
    let started = false;

    const load = async () => {
      if (started) {
        return;
      }
      started = true;
      try {
        const response = await fetch(src);
        if (!response.ok) {
          throw new Error(`sticker ${response.status}`);
        }
        const buffer = await response.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let text: string;
        if (bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) {
          const gzip = new DecompressionStream("gzip");
          const stream = new Blob([buffer]).stream().pipeThrough(gzip);
          text = await new Response(stream).text();
        } else {
          text = await new Response(buffer).text();
        }
        const animationData = JSON.parse(text);
        const lottie = (await import("lottie-web")).default;
        if (cancelled) {
          return;
        }
        const animation = lottie.loadAnimation({
          container: host,
          renderer: "svg",
          loop: true,
          autoplay: true,
          animationData,
          rendererSettings: { preserveAspectRatio: "xMidYMid meet" },
        });
        animationRef.current = animation;
        setLoaded(true);
      } catch {
        if (!cancelled) {
          setFailed(true);
        }
      }
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            void load();
            animationRef.current?.play();
          } else {
            animationRef.current?.pause();
          }
        }
      },
      { threshold: 0.2 },
    );
    observer.observe(host);
    return () => {
      cancelled = true;
      observer.disconnect();
      animationRef.current?.destroy();
      animationRef.current = null;
    };
  }, [src, failed]);

  if (!src || failed) {
    return (
      <div className="g-sticker">
        <MediaThumb src={poster} alt={alt} />
      </div>
    );
  }

  return (
    <div className="g-sticker g-tgs" data-loaded={loaded || undefined}>
      <div ref={hostRef} className="g-tgs-host" />
      {!loaded ? <MediaThumb src={poster} alt={alt} /> : null}
    </div>
  );
}

function VoicePlayer({ media }: { media: MessageMedia }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const duration = media.duration || 0;
  const bars =
    media.waveform && media.waveform.length > 0
      ? media.waveform
      : Array.from({ length: 36 }, (_, index) => 4 + ((index * 7) % 22));

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    if (audio.paused) {
      void audio.play();
    } else {
      audio.pause();
    }
  };

  const seek = (event: MouseEvent<HTMLButtonElement>) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(audio.duration) || audio.duration <= 0) {
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    audio.currentTime = ((event.clientX - rect.left) / rect.width) * audio.duration;
  };

  return (
    <div className="g-voice">
      <button type="button" className="g-voice-play" aria-label={playing ? "Pause" : "Play"} onClick={toggle}>
        <Icon name={playing ? "pause" : "play_arrow"} size={20} filled />
      </button>
      <button type="button" className="g-waveform" onClick={seek} aria-label="Seek voice message">
        {bars.map((bar, index) => (
          <span
            key={index}
            className="g-waveform-bar"
            data-played={index / bars.length <= progress || undefined}
            style={{ height: `${Math.max(3, Math.min(22, 4 + bar * 0.6))}px` }}
          />
        ))}
      </button>
      <span className="g-voice-time">
        {formatDuration(playing ? Math.round(duration * progress) : duration)}
      </span>
      {media.streamUrl ? (
        <audio
          ref={audioRef}
          src={media.streamUrl}
          preload="metadata"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => {
            setPlaying(false);
            setProgress(0);
          }}
          onTimeUpdate={(event) => {
            const audio = event.currentTarget;
            setProgress(audio.duration > 0 ? audio.currentTime / audio.duration : 0);
          }}
        />
      ) : null}
    </div>
  );
}

function AudioPlayer({ media }: { media: MessageMedia }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const title = media.title || media.name;
  const performer = media.performer || "";

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    if (audio.paused) {
      void audio.play();
    } else {
      audio.pause();
    }
  };

  return (
    <div className="g-audio">
      <button type="button" className="g-audio-play" aria-label={playing ? "Pause" : "Play"} onClick={toggle}>
        <Icon name={playing ? "pause" : "play_arrow"} size={20} filled />
      </button>
      <span className="g-audio-art" style={{ background: media.color || "#7c9cf5" }}>
        <Icon name="audio_file" size={22} />
      </span>
      <span className="g-audio-copy">
        <span className="g-audio-title">{title}</span>
        <span className="g-audio-meta">
          {performer || "Audio"}
          {media.duration ? ` · ${formatDuration(media.duration)}` : ""}
        </span>
        <span className="g-audio-progress">
          <span style={{ width: `${Math.round(progress * 100)}%` }} />
        </span>
      </span>
      {media.streamUrl ? (
        <audio
          ref={audioRef}
          src={media.streamUrl}
          preload="metadata"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => {
            setPlaying(false);
            setProgress(0);
          }}
          onTimeUpdate={(event) => {
            const audio = event.currentTarget;
            setProgress(audio.duration > 0 ? audio.currentTime / audio.duration : 0);
          }}
        />
      ) : null}
    </div>
  );
}

function WebpageCard({
  media,
  onToast,
}: {
  media: MessageMedia;
  onToast?: (message: string) => void;
}) {
  const open = () => {
    if (media.url) {
      void Browser.OpenURL(media.url.startsWith("http") ? media.url : `https://${media.url}`);
    } else {
      onToast?.("This preview has no URL");
    }
  };
  return (
    <button type="button" className="g-webpage" onClick={open}>
      <span className="g-webpage-text">
        {media.siteName ? <span className="g-webpage-site">{media.siteName}</span> : null}
        <span className="g-webpage-title">{media.title || media.name}</span>
        {media.description ? (
          <span className="g-webpage-description">{media.description}</span>
        ) : null}
        <span className="g-webpage-url">{media.url}</span>
      </span>
      {media.thumbUrl || media.photoUrl ? (
        <span className="g-webpage-image">
          <MediaThumb
            src={media.photoUrl || media.thumbUrl}
            fallbackSrc={media.photoUrl && media.thumbUrl ? media.thumbUrl : undefined}
            alt=""
          />
        </span>
      ) : null}
    </button>
  );
}

function PollCard({ media }: { media: MessageMedia }) {
  const total =
    media.totalVoters && media.totalVoters > 0
      ? media.totalVoters
      : Math.max(1, (media.voteCounts ?? []).reduce((sum, value) => sum + value, 0));
  return (
    <div className="g-poll">
      <div className="g-poll-head">
        <span className="g-poll-kind">
          {media.quiz ? "Quiz" : media.publicVoters ? "Public poll" : "Poll"}
        </span>
        {media.pollClosed ? <span className="g-poll-closed">Closed</span> : null}
      </div>
      <div className="g-poll-question">
        {media.name}
        {media.multipleChoice ? <span className="g-poll-hint">Multiple choice</span> : null}
      </div>
      <div className="g-poll-options">
        {(media.options ?? []).map((option, index) => {
          const votes = media.voteCounts?.[index] ?? 0;
          const percent = total > 0 ? Math.round((votes / total) * 100) : 0;
          const chosen = Boolean(media.chosen?.[index]);
          const correct = media.correctOption === index;
          return (
            <span
              key={`${option}-${index}`}
              className="g-poll-option"
              data-chosen={chosen || undefined}
              data-correct={correct || undefined}
            >
              <span className="g-poll-fill" style={{ width: `${percent}%` }} />
              <span className="g-poll-check">
                {chosen || correct ? <Icon name="check" size={14} /> : null}
              </span>
              <span className="g-poll-label">{option}</span>
              <span className="g-poll-percent">{percent}%</span>
            </span>
          );
        })}
      </div>
      <div className="g-poll-footer">
        <span>{media.totalVoters ?? 0} voted</span>
        {media.explanation ? <span className="g-poll-explanation">{media.explanation}</span> : null}
      </div>
    </div>
  );
}

function LocationCard({ media }: { media: MessageMedia }) {
  const openMap = () => {
    if (media.latitude === undefined || media.longitude === undefined) {
      return;
    }
    void Browser.OpenURL(
      `https://www.openstreetmap.org/?mlat=${media.latitude}&mlon=${media.longitude}#map=15/${media.latitude}/${media.longitude}`,
    );
  };
  return (
    <button type="button" className="g-location" onClick={openMap}>
      <LocationPreview latitude={media.latitude ?? 0} longitude={media.longitude ?? 0} />
      <div className="g-location-copy">
        <span className="g-location-title">{media.title || media.name}</span>
        {media.description ? (
          <span className="g-location-address">{media.description}</span>
        ) : null}
        {media.live ? <span className="g-location-live">Live location</span> : null}
      </div>
    </button>
  );
}

function ContactCard({ media }: { media: MessageMedia }) {
  return (
    <div className="g-contact">
      <span className="g-contact-avatar" style={{ background: media.color || "#8774e1" }}>
        {(media.contactName || media.name || "?").slice(0, 1).toUpperCase()}
      </span>
      <span className="g-contact-copy">
        <span className="g-contact-name">{media.contactName || media.name}</span>
        <span className="g-contact-phone">{media.phone}</span>
      </span>
      <Icon name="person" size={18} />
    </div>
  );
}

function DiceCard({ media }: { media: MessageMedia }) {
  return (
    <div className="g-dice">
      <span className="g-dice-emoji">{media.emoji || "🎲"}</span>
      <span className="g-dice-value">{media.value}</span>
    </div>
  );
}

function ChecklistCard({ media }: { media: MessageMedia }) {
  const items = media.checklist ?? [];
  const done = items.filter((item) => item.done).length;
  return (
    <div className="g-checklist">
      <div className="g-checklist-head">
        <Icon name="checklist" size={18} />
        <span>{media.title || media.name || "Checklist"}</span>
        <span className="g-checklist-count">
          {done}/{items.length}
        </span>
      </div>
      <div className="g-checklist-progress">
        <span style={{ width: `${items.length ? (done / items.length) * 100 : 0}%` }} />
      </div>
      {items.map((item, index) => (
        <div key={`${item.text}-${index}`} className="g-checklist-item" data-done={item.done || undefined}>
          <span className="g-checklist-box">{item.done ? <Icon name="check" size={12} /> : null}</span>
          <span>{item.text}</span>
        </div>
      ))}
    </div>
  );
}

function RichCard({
  icon,
  title,
  description,
  accent,
  footer,
  locked,
}: {
  icon: string;
  title: string;
  description?: string;
  accent?: string;
  footer?: string;
  locked?: boolean;
}) {
  return (
    <div className="g-rich-card" style={accent?.startsWith("linear") ? { background: accent } : undefined}>
      <span className="g-rich-icon" style={accent && !accent.startsWith("linear") ? { color: accent } : undefined}>
        <Icon name={icon} size={24} />
      </span>
      <span className="g-rich-copy">
        <span className="g-rich-title">{title}</span>
        {description ? <span className="g-rich-description">{description}</span> : null}
        {footer ? <span className="g-rich-footer">{footer}</span> : null}
      </span>
      {locked ? <Icon name="lock" size={16} /> : null}
    </div>
  );
}

function FileCard({
  media,
  downloadBadge,
  onDownload,
}: {
  media: MessageMedia;
  downloadBadge?: ReactNode;
  onDownload?: () => void;
}) {
  const icon =
    media.kind === "voice" || media.kind === "audio"
      ? "audio_file"
      : media.kind === "video"
        ? "movie"
        : "description";
  return (
    <button type="button" className="g-file" onClick={onDownload}>
      <span className="g-file-icon-wrap">
        <span className="g-file-icon" style={{ background: media.color || "#7c9cf5" }}>
          <Icon name={icon} size={20} />
        </span>
        {downloadBadge}
      </span>
      <span className="g-file-copy">
        <span className="g-file-name">{media.name}</span>
        <span className="g-file-size">
          {[media.size, media.duration ? formatDuration(media.duration) : "", media.ext]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </span>
    </button>
  );
}

function AlbumGrid({
  items,
  onOpenPhoto,
  onPlayVideo,
  downloads,
  onDownloadInline,
  onOpenDownloaded,
  onPauseDownload,
  onResumeDownload,
}: {
  items: Message[];
  onOpenPhoto?: (message: Message, source?: ViewerSource) => void;
  onPlayVideo?: (message: Message, source?: ViewerSource) => void;
  downloads?: Map<number, DownloadTask>;
  onDownloadInline?: (ids: number[]) => void;
  onOpenDownloaded?: (task: DownloadTask) => void;
  onPauseDownload?: (task: DownloadTask) => void;
  onResumeDownload?: (task: DownloadTask) => void;
}) {
  return (
    <div className="g-album" data-count={items.length}>
      {items.map((item) => {
        const media = item.media;
        if (!media) {
          return null;
        }
        const isVideo = media.kind === "video" || media.kind === "video_note";
        const isPhoto = media.kind === "photo";
        const badge = (
          <DownloadBadge
            asSpan
            messageID={item.id}
            task={downloads?.get(item.id)}
            onStart={onDownloadInline}
            onOpen={onOpenDownloaded}
            onPause={onPauseDownload}
            onResume={onResumeDownload}
          />
        );
        const content = <MediaThumb src={media.thumbUrl || media.photoUrl} alt={media.name} />;
        if (!isVideo && !isPhoto) {
          return (
            <div key={item.id} className="g-album-cell">
              {content}
              {badge}
            </div>
          );
        }
        return (
          <button
            type="button"
            key={item.id}
            className="g-album-cell"
            data-media-id={item.id}
            aria-label={isVideo ? "Play video" : "Open photo"}
            onClick={(event) => {
              const source = captureViewerSource(
                event.currentTarget,
                media.thumbUrl || media.photoUrl,
              );
              if (isVideo) {
                onPlayVideo?.(item, source);
              } else {
                onOpenPhoto?.(item, source);
              }
            }}
          >
            {content}
            {badge}
            {isVideo ? (
              <span className="g-album-play" aria-hidden="true">
                <Icon name="play_arrow" size={20} filled />
              </span>
            ) : null}
            {media.duration && isVideo ? (
              <span className="g-media-duration">{formatDuration(media.duration)}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function LazyVideo({
  src,
  poster,
  loop = true,
}: {
  src?: string;
  poster?: string;
  loop?: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node || !src) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            if (node.src !== src) {
              node.src = src;
            }
            void node.play().catch(() => undefined);
          } else {
            node.pause();
          }
        }
      },
      { threshold: 0.25 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [src]);
  if (!src) {
    return <MediaThumb src={poster} alt="" />;
  }
  return (
    <video
      ref={ref}
      poster={poster}
      loop={loop}
      muted
      playsInline
      preload="none"
      className="g-media-video-element"
    />
  );
}

function formatDuration(seconds: number) {
  const value = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(value / 60);
  return `${minutes}:${String(value % 60).padStart(2, "0")}`;
}

function formatAmount(media: MessageMedia) {
  if (!media.amount) {
    return "Invoice";
  }
  if (media.currency === "XTR") {
    return `${formatStars(media.amount)} Stars`;
  }
  const amount = (media.amount / 100).toFixed(2);
  return `${amount} ${media.currency || ""}`.trim();
}

function formatStars(amount?: number) {
  if (!amount) {
    return "0";
  }
  return amount.toLocaleString();
}

function formatDate(timestamp: number) {
  try {
    return new Date(timestamp * 1000).toLocaleDateString();
  } catch {
    return "";
  }
}
