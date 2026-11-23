import { useMemo } from "react";
import { MapContainer, Polyline, TileLayer } from "react-leaflet";
import type { LatLngBoundsExpression, LatLngTuple } from "leaflet";
import type { TrackPoint } from "../lib/types";

export default function RouteMap({ points, color }: { points: TrackPoint[]; color: string }) {
  const line = useMemo(() => points.map((p) => [p.lat, p.lon] as LatLngTuple), [points]);
  const bounds = useMemo<LatLngBoundsExpression>(() => {
    const lats = line.map((p) => p[0]), lons = line.map((p) => p[1]);
    return [[Math.min(...lats), Math.min(...lons)], [Math.max(...lats), Math.max(...lons)]];
  }, [line]);

  return (
    <div className="h-80 overflow-hidden rounded-xl">
      <MapContainer bounds={bounds} boundsOptions={{ padding: [24, 24] }} scrollWheelZoom={false} className="h-full w-full" attributionControl>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
        <Polyline positions={line} pathOptions={{ color, weight: 4, opacity: 0.9, lineCap: "round", lineJoin: "round" }} />
      </MapContainer>
    </div>
  );
}
