import {
  IconCamera,
  IconDeviceDesktop,
  IconFile,
  IconHeadphones,
  IconLock,
  IconMapPin,
  IconMessage,
  IconMicrophone,
  IconMoodSmile,
  IconMusic,
  IconUsers,
} from "@tabler/icons-react";

/**
 * Rebuilt welcome illustration: blue cloud field, diagonal app icons and the
 * white paper plane used by Telegram Desktop's first screen.
 */
export function LoginHero() {
  return (
    <div className="tg-login-hero" aria-hidden="true">
      <span className="tg-hero-cloud tg-hero-cloud-left" />
      <span className="tg-hero-cloud tg-hero-cloud-right" />

      <span className="tg-hero-icon tg-hero-icon-1"><IconUsers size={30} /></span>
      <span className="tg-hero-icon tg-hero-icon-2"><IconMicrophone size={22} /></span>
      <span className="tg-hero-icon tg-hero-icon-3"><IconMusic size={34} /></span>
      <span className="tg-hero-icon tg-hero-icon-4"><IconHeadphones size={22} /></span>
      <span className="tg-hero-icon tg-hero-icon-5"><IconCamera size={20} /></span>
      <span className="tg-hero-icon tg-hero-icon-6"><IconMapPin size={22} /></span>
      <span className="tg-hero-icon tg-hero-icon-7"><IconLock size={16} /></span>
      <span className="tg-hero-icon tg-hero-icon-8"><IconMoodSmile size={26} /></span>
      <span className="tg-hero-icon tg-hero-icon-9"><IconFile size={20} /></span>
      <span className="tg-hero-icon tg-hero-icon-10"><IconDeviceDesktop size={20} /></span>
      <span className="tg-hero-icon tg-hero-icon-11"><IconMessage size={19} /></span>

      <svg className="tg-hero-plane" viewBox="0 0 220 150" aria-hidden="true">
        <path d="M20 102 L196 20 L160 126 L113 91 L84 132 L73 87 Z" fill="#ffffff" />
        <path
          d="M73 87 L196 20 L113 91 L109 119 L103 91 Z"
          fill="#dbe5ee"
        />
        <path d="M20 102 L73 87 L81 104 Z" fill="#eef3f7" />
        <path
          d="M13 106 L74 84"
          fill="none"
          stroke="rgba(210,229,245,0.7)"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path
          d="M35 129 L107 104"
          fill="none"
          stroke="rgba(210,229,245,0.6)"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}
