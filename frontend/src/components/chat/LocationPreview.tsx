import { useState } from "react";
import { Icon } from "../ui/Icon";

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
    <span className="g-location-map">
      <span className="g-location-road g-location-road-a" />
      <span className="g-location-road g-location-road-b" />
      <span className="g-location-road g-location-road-c" />
      {!failed ? (
        <img
          className="g-location-tile"
          src={url}
          alt=""
          draggable={false}
          onError={() => setFailed(true)}
        />
      ) : null}
      <span className="g-location-pin">
        <Icon name="location_on" size={22} filled />
      </span>
      <span className="g-location-attribution">© OpenStreetMap</span>
    </span>
  );
}
