import { useState } from "react";
import { IconMapPin } from "@tabler/icons-react";

interface LocationPreviewProps {
  latitude: number;
  longitude: number;
}

const ZOOM = 15;

function tileFor(latitude: number, longitude: number) {
  const scale = 2 ** ZOOM;
  const x = Math.floor(((longitude + 180) / 360) * scale);
  const radians = (latitude * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2) * scale,
  );
  return { x, y };
}

export function LocationPreview({ latitude, longitude }: LocationPreviewProps) {
  const [failed, setFailed] = useState(false);
  const { x, y } = tileFor(latitude, longitude);
  const url = `https://tile.openstreetmap.org/${ZOOM}/${x}/${y}.png`;

  return (
    <span className="location-map">
      <span className="location-road location-road-a" />
      <span className="location-road location-road-b" />
      <span className="location-road location-road-c" />
      {!failed ? (
        <img
          className="location-tile"
          src={url}
          alt=""
          draggable={false}
          onError={() => setFailed(true)}
        />
      ) : null}
      <span className="location-pin">
        <IconMapPin size={20} />
      </span>
      <span className="location-attribution">© OpenStreetMap</span>
    </span>
  );
}
