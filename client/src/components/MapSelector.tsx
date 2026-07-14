import { MapContainer, TileLayer, Circle, Marker, useMapEvents } from "react-leaflet";
import { Icon } from "leaflet";

// Fix default marker icon paths (Leaflet + bundlers)
const markerIcon = new Icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

interface Props {
  center: { lat: number; lng: number };
  radiusM: number;
  onCenterChange: (c: { lat: number; lng: number }) => void;
}

function ClickHandler({ onCenterChange }: { onCenterChange: Props["onCenterChange"] }) {
  useMapEvents({
    click(e) {
      onCenterChange({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

export default function MapSelector({ center, radiusM, onCenterChange }: Props) {
  return (
    <div className="map-wrap">
      <MapContainer center={[center.lat, center.lng]} zoom={12} style={{ height: 320, borderRadius: 8 }}>
        <TileLayer
          attribution='&copy; OpenStreetMap'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Circle center={[center.lat, center.lng]} radius={radiusM} pathOptions={{ color: "#2E75B6" }} />
        <Marker
          position={[center.lat, center.lng]}
          icon={markerIcon}
          draggable
          eventHandlers={{
            dragend: (e) => {
              const m = e.target.getLatLng();
              onCenterChange({ lat: m.lat, lng: m.lng });
            },
          }}
        />
        <ClickHandler onCenterChange={onCenterChange} />
      </MapContainer>
      <p className="hint">Click the map or drag the pin to set the search centre.</p>
    </div>
  );
}
