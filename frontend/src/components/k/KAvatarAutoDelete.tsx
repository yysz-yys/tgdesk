/**
 * The auto-delete (TTL) badge painted in a chat-list avatar's bottom-right
 * corner, ported from tweb's `avatar-auto-delete-timer` (`components/avatarNew.tsx`
 * + `_avatar.scss`): a 22px circle with a dashed outline glyph, the period's
 * number and its unit glyph ("1D", "2D", "3W", ...), over a plate tinted with
 * the avatar's own colour. For a photo avatar the plate uses the blurred
 * bottom-right quarter of the photo, the way tweb's `computeLockColor` does.
 */
import { useEffect, useState } from "react";
import { KIcon } from "./KIcon";
import {
  AUTO_DELETE_CLOCK_ICON,
  AUTO_DELETE_EMPTY_ICON,
  type AutoDeleteBadge,
} from "./avatarAutoDelete";

interface KAvatarAutoDeleteProps {
  badge: AutoDeleteBadge;
  /** The avatar photo, when the avatar is an image (drives the plate colour). */
  photoUrl?: string;
  /** The avatar is a coloured gradient (the plate uses its --color-top/-bottom). */
  colored: boolean;
}

/** tweb `computeLockColor`: average of the photo's bottom-right quarter + a
 * translucent neutral grey, as a data URL. */
function lockColor(photo: HTMLImageElement): string | undefined {
  try {
    const size = 20;
    const source = document.createElement("canvas");
    source.width = size;
    source.height = size;
    const context = source.getContext("2d");
    if (!context) return undefined;
    const width = photo.naturalWidth || photo.width;
    const height = photo.naturalHeight || photo.height;
    context.drawImage(
      photo,
      width * 0.75,
      height * 0.75,
      width * 0.25,
      height * 0.25,
      0,
      0,
      size,
      size,
    );
    const data = context.getImageData(0, 0, size, size).data;
    let red = 0;
    let green = 0;
    let blue = 0;
    let alpha = 0;
    for (let index = 0; index < data.length; index += 4) {
      red += data[index];
      green += data[index + 1];
      blue += data[index + 2];
      alpha += data[index + 3];
    }
    const output = document.createElement("canvas");
    output.width = size;
    output.height = size;
    const out = output.getContext("2d");
    if (!out) return undefined;
    out.fillStyle = `rgba(${Math.round((red * 255) / alpha)}, ${Math.round(
      (green * 255) / alpha,
    )}, ${Math.round((blue * 255) / alpha)}, 1)`;
    out.fillRect(0, 0, size, size);
    out.fillStyle = "rgba(112, 117, 121, 0.3)";
    out.fillRect(0, 0, size, size);
    return output.toDataURL("image/jpeg");
  } catch {
    // A cross-origin photo without CORS permission cannot be sampled: the
    // badge falls back to its dark plate.
    return undefined;
  }
}

export function KAvatarAutoDelete({
  badge,
  photoUrl,
  colored,
}: KAvatarAutoDeleteProps) {
  const [background, setBackground] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!photoUrl) {
      setBackground(undefined);
      return;
    }
    let cancelled = false;
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      if (!cancelled) setBackground(lockColor(image));
    };
    image.onerror = () => {
      if (!cancelled) setBackground(undefined);
    };
    image.src = photoUrl;
    return () => {
      cancelled = true;
    };
  }, [photoUrl]);

  return (
    <div className="avatar-auto-delete-timer">
      {background ? (
        <div
          className="avatar-auto-delete-timer__background"
          style={{ background: `url(${background})` }}
        />
      ) : colored ? (
        <div className="avatar-auto-delete-timer__background avatar-auto-delete-timer__background--color" />
      ) : null}
      <div className="avatar-auto-delete-timer__icon">
        {badge.numberIcon && badge.unitIcon ? (
          <span className="overlayed-icon">
            <KIcon name={AUTO_DELETE_EMPTY_ICON} />
            <KIcon
              name={badge.numberIcon}
              className={
                badge.shifted
                  ? "overlayed-icon__floating-icon auto-delete-icon--shifted"
                  : "overlayed-icon__floating-icon"
              }
            />
            <KIcon
              name={badge.unitIcon}
              className={
                badge.shifted
                  ? "overlayed-icon__floating-icon auto-delete-icon--shifted"
                  : "overlayed-icon__floating-icon"
              }
            />
          </span>
        ) : (
          <KIcon name={AUTO_DELETE_CLOCK_ICON} />
        )}
      </div>
    </div>
  );
}
