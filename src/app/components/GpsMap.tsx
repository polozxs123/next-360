"use client";

import React, {
  useEffect,
  useMemo,
  useState,
  useCallback,
  useRef,
} from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Polyline,
  useMap,
  useMapEvent,
  Tooltip,
  useMapEvents,
  Popup,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import DraggablePointer from "./DraggablePointer";
import {
  File,
  GpsPoint,
  Marker as IMarker,
  PointMarker,
  ProjectLocation,
} from "@prisma/client";
import { formatDistance } from "../utis/formatDistance";

import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import "leaflet.markercluster";

export interface MarkerWithIcon {
  id: number;
  position: [number, number];
  marker?: IMarker;
  icon?: L.Icon;
}

const customStyles = `
  .custom-tooltip {
    background: rgba(255, 255, 255, 0.95) !important;
    border: none !important;
    border-radius: 8px !important;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15) !important;
    padding: 8px 12px !important;
    font-family: system-ui, -apple-system, sans-serif !important;
  }
  .custom-tooltip::before {
    border-top-color: rgba(255, 255, 255, 0.95) !important;
  }
  .custom-popup .leaflet-popup-content-wrapper {
    border-radius: 12px !important;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2) !important;
    padding: 16px !important;
  }
  .custom-popup .leaflet-popup-tip {
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1) !important;
  }
  .custom-popup .leaflet-popup-content {
    margin: 0 !important;
  }
  
  /* Estilos para clustering */
  .marker-cluster-small {
    background-color: rgba(110, 204, 57, 0.6);
  }
  .marker-cluster-small div {
    background-color: rgba(110, 204, 57, 0.8);
    font-weight: bold;
    font-size: 12px;
  }
  .marker-cluster-medium {
    background-color: rgba(241, 211, 87, 0.6);
  }
  .marker-cluster-medium div {
    background-color: rgba(241, 211, 87, 0.8);
    font-weight: bold;
    font-size: 13px;
  }
  .marker-cluster-large {
    background-color: rgba(253, 156, 115, 0.6);
  }
  .marker-cluster-large div {
    background-color: rgba(253, 156, 115, 0.8);
    font-weight: bold;
    font-size: 14px;
  }
  
  /* Animación suave para markers */
  .leaflet-marker-icon {
    transition: transform 0.2s ease;
  }
  .leaflet-marker-icon:hover {
    transform: scale(1.1);
    z-index: 1000 !important;
  }
  
  /* Botones mejorados */
  .map-control-button {
    padding: 12px 20px;
    font-size: 16px;
    font-weight: 600;
    border-radius: 24px;
    border: none;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    transition: all 0.3s ease;
    backdrop-filter: blur(10px);
  }
  .map-control-button:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2);
  }
  .map-control-button:active {
    transform: translateY(0);
  }
  
  /* Overlay para modo añadir */
  .adding-mode-overlay {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.3);
    backdrop-filter: blur(2px);
    z-index: 500;
    pointer-events: none;
    animation: fadeIn 0.2s ease;
  }
  
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  
  /* Indicador de coordenadas */
  .coordinates-indicator {
    position: absolute;
    top: 10px;
    left: 10px;
    padding: 8px 16px;
    background: rgba(255, 255, 255, 0.95);
    backdrop-filter: blur(10px);
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    z-index: 1000;
    pointer-events: none;
    font-size: 13px;
    font-weight: 500;
    font-family: 'Courier New', monospace;
  }

  /* Polyline con mejor performance */
  .leaflet-overlay-pane svg {
    will-change: transform;
  }
`;

L.Marker.prototype.options.icon = L.icon({
  iconUrl: "/images/marker-icon.png",
  shadowUrl: "/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

// ---------------------------------------------------------------------------
// 🔥 Spatial index helpers - computados una sola vez por proyecto
// ---------------------------------------------------------------------------

type ProjectLoc = { lat: number; lon: number; meter?: number | null };

/** Devuelve una copia ordenada por latitud para búsqueda binaria. */
function buildSortedIndex(locations: ProjectLoc[]): ProjectLoc[] {
  return [...locations].sort((a, b) => a.lat - b.lat);
}

/**
 * Encuentra el proyecto más cercano usando búsqueda binaria sobre lat
 * + ventana de ±WINDOW vecinos. O(log n + WINDOW) en lugar de O(n).
 */
function findClosestInIndex(
  sortedLocs: ProjectLoc[],
  lat: number,
  lon: number,
): { location: ProjectLoc; distance: number } {
  if (!sortedLocs.length)
    return { location: { lat: 0, lon: 0 }, distance: Infinity };

  const WINDOW = 60; // vecinos a revisar a cada lado del pivot

  // Búsqueda binaria por lat
  let lo = 0;
  let hi = sortedLocs.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sortedLocs[mid].lat < lat) lo = mid + 1;
    else hi = mid;
  }

  const start = Math.max(0, lo - WINDOW);
  const end = Math.min(sortedLocs.length - 1, lo + WINDOW);

  let closest = sortedLocs[start];
  let minDist = Infinity;

  for (let i = start; i <= end; i++) {
    const d = getDistanceMeters(lat, lon, sortedLocs[i].lat, sortedLocs[i].lon);
    if (d < minDist) {
      minDist = d;
      closest = sortedLocs[i];
    }
  }

  return { location: closest, distance: minDist };
}

// ---------------------------------------------------------------------------

const StyleInjector = React.memo(function StyleInjector() {
  useEffect(() => {
    const styleElement = document.createElement("style");
    styleElement.innerHTML = customStyles;
    document.head.appendChild(styleElement);
    return () => {
      document.head.removeChild(styleElement);
    };
  }, []);
  return null;
});

const ProjectLocationsLayer = React.memo(function ProjectLocationsLayer({
  locations,
}: {
  locations: { lat: number; lon: number; meter?: number | null }[];
}) {
  const map = useMap();

  useEffect(() => {
    if (!locations.length) return;

    const layer = L.layerGroup();
    const canvas = L.canvas({ padding: 0.5 });

    locations.forEach((loc) => {
      const label = formatDistance(loc.meter as number);

      const marker = L.circleMarker([loc.lat, loc.lon], {
        radius: 4,
        renderer: canvas,
        weight: 2,
        fillColor: "#3b82f6",
        fillOpacity: 0.7,
      });

      if (label) {
        marker.bindTooltip(label, {
          direction: "top",
          offset: [0, -8],
          opacity: 0.95,
          className: "custom-tooltip",
          sticky: true,
        });
      }

      marker.addTo(layer);
    });

    layer.addTo(map);
    return () => {
      map.removeLayer(layer);
    };
  }, [locations, map]);

  return null;
});

const SelectedPositionEffect = React.memo(function SelectedPositionEffect({
  selectedPosition,
}: {
  selectedPosition?: { lat: number; lon: number } | null;
}) {
  const map = useMap();
  const lastPositionRef = useRef<{ lat: number; lon: number } | null>(null);

  useEffect(() => {
    if (!selectedPosition) return;

    const lastPos = lastPositionRef.current;
    if (
      lastPos &&
      Math.abs(lastPos.lat - selectedPosition.lat) < 0.00001 &&
      Math.abs(lastPos.lon - selectedPosition.lon) < 0.00001
    ) {
      return;
    }

    const { lat, lng } = map.getCenter();
    const zoom = map.getZoom();
    const same =
      Math.abs(lat - selectedPosition.lat) < 0.0001 &&
      Math.abs(lng - selectedPosition.lon) < 0.0001;

    if (!same) {
      const targetZoom = zoom < 16 ? 18 : zoom;
      map.setView([selectedPosition.lat, selectedPosition.lon], targetZoom, {
        animate: true,
        duration: 0.5,
      });
    }

    lastPositionRef.current = selectedPosition;
  }, [selectedPosition, map]);

  return null;
});

type GpsPointWithFile = GpsPoint & {
  fileId: number;
  fileIndex: number;
  fileName?: string;
  GpsPointComment?: { comment: string }[];
};

function getDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
) {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

// ---------------------------------------------------------------------------
// 🔥 Tipo para puntos GPS pre-enriquecidos con la referencia más cercana
// ---------------------------------------------------------------------------
type GpsPointEnriched = GpsPointWithFile & {
  closest: { location: ProjectLoc; distance: number };
};

const LegendMarkers = React.memo(function LegendMarkers({
  legend,
  visibleGroups,
  selectedPosition,
  openPreview,
  visibleTags,
  onSelectPoint,
  allGpsPoints,
}: {
  legend: PointMarker[];
  visibleGroups: Record<number, boolean>;
  selectedPosition?: { lat: number; lon: number } | null;
  openPreview: (item: any) => void;
  visibleTags: Record<number, boolean>;
  onSelectPoint: (p: {
    second: number;
    fileId: number;
    fileIndex: number;
  }) => void;
  allGpsPoints: GpsPointWithFile[];
}) {
  const map = useMap();
  const clusterGroupRef = useRef<L.MarkerClusterGroup | null>(null);

  const iconsById = useMemo(() => {
    const iconMap = new Map<number, L.Icon | undefined>();

    legend.forEach((item) => {
      if (iconMap.has(item.id)) return;
      try {
        iconMap.set(
          item.id,
          L.icon({
            iconUrl: (item as any).marker.icon,
            iconSize: [15, 15],
            iconAnchor: [7, 15],
            popupAnchor: [0, -15],
          }),
        );
      } catch {
        iconMap.set(item.id, undefined);
      }
    });

    return iconMap;
  }, [legend]);

  const hasVisibleTags = useCallback(
    (item: PointMarker) => {
      const itemTags = (item as any).Tags || [];
      if (itemTags.length === 0) return true;
      return itemTags.some((tagId: number) => visibleTags[tagId] !== false);
    },
    [visibleTags],
  );

  const filteredLegend = useMemo(
    () =>
      legend.filter(
        (item) =>
          (visibleGroups[item.markerId || 0] ?? true) && hasVisibleTags(item),
      ),
    [legend, visibleGroups, hasVisibleTags],
  );

  // 🔥 Índice ordenado de GPS points para búsqueda binaria (on-click)
  const sortedGpsPoints = useMemo(
    () => [...allGpsPoints].sort((a, b) => a.lat - b.lat),
    [allGpsPoints],
  );

  // 🔥 findClosestGpsPoint ahora usa búsqueda binaria
  const findClosestGpsPoint = useCallback(
    (markerLat: number, markerLon: number) => {
      if (!sortedGpsPoints.length) return null;

      const WINDOW = 60;
      let lo = 0;
      let hi = sortedGpsPoints.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (sortedGpsPoints[mid].lat < markerLat) lo = mid + 1;
        else hi = mid;
      }

      const start = Math.max(0, lo - WINDOW);
      const end = Math.min(sortedGpsPoints.length - 1, lo + WINDOW);

      let closest = sortedGpsPoints[start];
      let minDist = Infinity;

      for (let i = start; i <= end; i++) {
        const d = getDistanceMeters(
          markerLat,
          markerLon,
          sortedGpsPoints[i].lat,
          sortedGpsPoints[i].lon,
        );
        if (d < minDist) {
          minDist = d;
          closest = sortedGpsPoints[i];
        }
      }

      return closest;
    },
    [sortedGpsPoints],
  );

  useEffect(() => {
    const clusterGroup = L.markerClusterGroup({
      maxClusterRadius: 50,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true,
      spiderfyDistanceMultiplier: 1.5,
      iconCreateFunction: (cluster: any) => {
        const childCount = cluster.getChildCount();
        let c = "marker-cluster-";
        if (childCount < 10) {
          c += "small";
        } else if (childCount < 100) {
          c += "medium";
        } else {
          c += "large";
        }

        return L.divIcon({
          html: `<div><span>${childCount}</span></div>`,
          className: `marker-cluster ${c}`,
          iconSize: L.point(40, 40),
        });
      },
    });

    clusterGroupRef.current = clusterGroup;

    filteredLegend.forEach((item) => {
      const icon = iconsById.get(item.id);
      if (!icon) return;

      const marker = L.marker([item.lat || 0, item.lon || 0], { icon });

      const popupContent = `
        <div class="custom-popup" style="text-align: center; min-width: 180px;">
          <div style="font-size: 16px; font-weight: 600; margin-bottom: 8px; color: #1f2937;">
            ${(item as any).marker.name}
          </div>
          <div style="font-size: 13px; color: #6b7280; margin-bottom: 4px;">
            <strong>Lat:</strong> ${item.lat?.toFixed(5)}
          </div>
          <div style="font-size: 13px; color: #6b7280; margin-bottom: 8px;">
            <strong>Lon:</strong> ${item.lon?.toFixed(5)}
          </div>
          ${
            item.comment
              ? `<div style="font-size: 13px; font-style: italic; color: #4b5563; margin-bottom: 12px; padding: 8px; background: #f3f4f6; border-radius: 6px;">
                  ${item.comment}
                </div>`
              : ""
          }
          <button
            onclick="window.openMarkerPreview(${item.id})"
            style="
              margin-top: 8px;
              padding: 8px 16px;
              background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
              color: white;
              border: none;
              border-radius: 8px;
              cursor: pointer;
              font-size: 14px;
              font-weight: 500;
              transition: all 0.2s;
              display: inline-flex;
              align-items: center;
              gap: 6px;
            "
            onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 4px 12px rgba(59, 130, 246, 0.4)'"
            onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='none'"
          >
            <i class="pi pi-eye" style="font-size: 14px;"></i>
            Ver detalles
          </button>
        </div>
      `;

      marker.bindPopup(popupContent, {
        className: "custom-popup",
        maxWidth: 300,
      });

      marker.on("click", () => {
        const closestGpsPoint = findClosestGpsPoint(
          item.lat || 0,
          item.lon || 0,
        );

        if (closestGpsPoint) {
          onSelectPoint({
            second: closestGpsPoint.second,
            fileId: closestGpsPoint.fileId,
            fileIndex: closestGpsPoint.fileIndex,
          });
        }
      });

      (marker as any)._itemData = item;
      clusterGroup.addLayer(marker);
    });

    (window as any).openMarkerPreview = (itemId: number) => {
      const item = filteredLegend.find((i) => i.id === itemId);
      if (item) openPreview(item);
    };

    clusterGroup.addTo(map);

    return () => {
      map.removeLayer(clusterGroup);
      delete (window as any).openMarkerPreview;
    };
  }, [
    filteredLegend,
    iconsById,
    map,
    openPreview,
    findClosestGpsPoint,
    onSelectPoint,
  ]);

  useEffect(() => {
    if (!selectedPosition || !clusterGroupRef.current) return;

    const targetItem = filteredLegend.find(
      (item) =>
        Math.abs((item.lat || 0) - selectedPosition.lat) < 0.00001 &&
        Math.abs((item.lon || 0) - selectedPosition.lon) < 0.00001,
    );

    if (targetItem) {
      clusterGroupRef.current.eachLayer((layer: any) => {
        if (
          layer._itemData &&
          layer._itemData.id === targetItem.id &&
          layer.openPopup
        ) {
          clusterGroupRef.current?.zoomToShowLayer(layer, () => {
            layer.openPopup();
          });
        }
      });
    }
  }, [selectedPosition, filteredLegend]);

  return null;
});

// ---------------------------------------------------------------------------
// 🔥 PointsLayer - recibe puntos ya enriquecidos con su referencia más cercana
// ---------------------------------------------------------------------------
const PointsLayer = React.memo(function PointsLayer({
  points,
  onSelectPoint,
}: {
  points: GpsPointEnriched[];
  onSelectPoint: (p: {
    second: number;
    fileId: number;
    fileIndex: number;
  }) => void;
}) {
  const map = useMap();
  const layersRef = useRef<{
    cluster: L.MarkerClusterGroup;
    layer: L.LayerGroup;
  } | null>(null);

  useEffect(() => {
    if (layersRef.current) {
      map.removeLayer(layersRef.current.cluster);
      map.removeLayer(layersRef.current.layer);
    }

    const layer = L.layerGroup();
    const clusterGroup = L.markerClusterGroup({
      maxClusterRadius: 40,
      disableClusteringAtZoom: 18,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
    });

    points.forEach((p) => {
      const commentText =
        p.GpsPointComment?.map((c) => c.comment).join("; ") ?? "";
      const hasComment = commentText.trim().length > 0;

      // 🔥 closest ya viene pre-calculado — sin iteración aquí
      const { location: closestLoc, distance: closestDist } = p.closest;

      const tooltipContent = `
  <div style="font-size: 12px; max-width: 240px; line-height: 1.4;">

    ${
      hasComment
        ? `<div style="margin-bottom: 6px; padding: 6px; background: #fef3c7; border-left: 3px solid #f59e0b; border-radius: 4px;">
            <strong>💬 Comentario:</strong>
            <div>${commentText}</div>
          </div>`
        : ""
    }

    <div><strong>Lat:</strong> ${p.lat.toFixed(5)}</div>
    <div><strong>Lon:</strong> ${p.lon.toFixed(5)}</div>

    <div style="font-size: 11px; color: #6b7280;">
      🎥 Archivo #${p.fileIndex + 1}
    </div>

    <hr style="margin: 6px 0;" />

    <div style="font-weight: 700; color: #2563eb;">
      📍 Proyecto más cercano
    </div>

    <div>
      <strong>Lat:</strong> ${closestLoc.lat.toFixed(5)}<br/>
      <strong>Lon:</strong> ${closestLoc.lon.toFixed(5)}
    </div>

    <div style="font-weight: 700; color: #16a34a;">
      📏 Distancia: ${closestDist.toFixed(2)} m
    </div>

    <div style="font-weight: 700; color: #111827;">
      📌 Referencia: ${closestLoc.meter ?? "N/A"}
    </div>

  </div>
`;

      const handleSelect = () => {
        onSelectPoint({
          second: p.second,
          fileId: p.fileId,
          fileIndex: p.fileIndex,
        });
      };

      if (hasComment) {
        const marker = L.marker([p.lat, p.lon], {
          icon: L.divIcon({
            html: `💬`,
            className: "comment-marker",
            iconSize: [24, 24],
          }),
        });

        marker.on("click", () => {
          handleSelect();
          setTimeout(() => marker.openTooltip(), 100);
        });

        marker.bindTooltip(tooltipContent, {
          direction: "top",
          offset: [0, -12],
          opacity: 0.95,
          className: "custom-tooltip",
        });

        clusterGroup.addLayer(marker);
      } else {
        const circle = L.circleMarker([p.lat, p.lon], {
          radius: 4,
          fillColor: "#ef4444",
          color: "#fff",
          fillOpacity: 0.6,
          opacity: 0.6,
          weight: 1,
        });

        circle.on("click", (e) => {
          L.DomEvent.stopPropagation(e);
          handleSelect();
          setTimeout(() => circle.openTooltip(), 100);
        });

        circle.bindTooltip(tooltipContent, {
          direction: "top",
          offset: [0, -6],
          opacity: 0.95,
          className: "custom-tooltip",
          sticky: false,
        });

        layer.addLayer(circle);
      }
    });

    clusterGroup.addTo(map);
    layer.addTo(map);

    layersRef.current = { cluster: clusterGroup, layer };

    return () => {
      if (layersRef.current) {
        map.removeLayer(layersRef.current.cluster);
        map.removeLayer(layersRef.current.layer);
      }
    };
  }, [points, onSelectPoint, map]);

  return null;
});

const MarkerUpdater = React.memo(function MarkerUpdater({
  files,
  currentTime,
  onSelectPoint,
  startKm,
  projectLocations,
  sortedProjectLocations,
}: {
  files: (File & { gpsPoints: GpsPoint[] })[];
  currentTime: {
    second: number;
    fileId: number;
    fileIndex: number;
  };
  onSelectPoint: (p: {
    second: number;
    fileId: number;
    fileIndex: number;
  }) => void;
  startKm: number;
  projectLocations: ProjectLoc[];
  // 🔥 índice ya ordenado pasado desde el padre
  sortedProjectLocations: ProjectLoc[];
}) {
  const map = useMap();
  const lastPosRef = useRef<[number, number] | null>(null);
  const isUserInteractingRef = useRef(false);

  // 🔥 pointsWithFile ya no se usa aquí - lo maneja GpsMap y baja como enriched
  const position = useMemo(() => {
    if (!files.length || !files[currentTime.fileIndex]) return null;

    const currentFile = files[currentTime.fileIndex];
    if (!currentFile.gpsPoints.length) return null;

    return currentFile.gpsPoints.reduce((prev, curr) =>
      Math.abs(curr.second - currentTime.second) <
      Math.abs(prev.second - currentTime.second)
        ? curr
        : prev,
    );
  }, [files, currentTime.fileIndex, currentTime.second]);

  useEffect(() => {
    const onMoveStart = () => {
      isUserInteractingRef.current = true;
    };

    const onMoveEnd = () => {
      setTimeout(() => {
        isUserInteractingRef.current = false;
      }, 1000);
    };

    map.on("movestart", onMoveStart);
    map.on("moveend", onMoveEnd);

    return () => {
      map.off("movestart", onMoveStart);
      map.off("moveend", onMoveEnd);
    };
  }, [map]);

  useEffect(() => {
    if (!position || isUserInteractingRef.current) return;

    const lastPos = lastPosRef.current;

    if (
      !lastPos ||
      Math.abs(lastPos[0] - position.lat) > 0.0001 ||
      Math.abs(lastPos[1] - position.lon) > 0.0001
    ) {
      map.setView([position.lat, position.lon], map.getZoom(), {
        animate: true,
        duration: 0.3,
      });

      lastPosRef.current = [position.lat, position.lon];
    }
  }, [position, map]);

  const customIcon = useMemo(
    () =>
      L.divIcon({
        html: `
        <div style="position: relative;">
          <svg width="24" height="34" viewBox="0 0 24 34">
            <circle cx="12" cy="28" r="6" fill="#22c55e" stroke="#15803d" stroke-width="2.5"/>
            <line x1="12" y1="0" x2="12" y2="22" stroke="#22c55e" stroke-width="5" stroke-linecap="round"/>
          </svg>
        </div>
      `,
        iconSize: [24, 34],
        iconAnchor: [12, 28],
        className: "",
      }),
    [],
  );

  // 🔥 Usa findClosestInIndex en lugar de O(n) lineal
  const closestProject = useMemo(() => {
    if (!position || !sortedProjectLocations.length) return null;
    return findClosestInIndex(
      sortedProjectLocations,
      position.lat,
      position.lon,
    );
  }, [position, sortedProjectLocations]);

  // 🔥 enrichedPoints ahora viene de GpsMap como prop para evitar recomputar aquí
  // PointsLayer se monta con los puntos ya enriquecidos
  const enrichedPoints = useMemo<GpsPointEnriched[]>(() => {
    return files.flatMap((file, fileIndex) =>
      file.gpsPoints.map((p) => ({
        ...p,
        fileId: file.id,
        fileIndex,
        closest: findClosestInIndex(sortedProjectLocations, p.lat, p.lon),
      })),
    );
  }, [files, sortedProjectLocations]);

  return (
    <>
      <PointsLayer points={enrichedPoints} onSelectPoint={onSelectPoint} />

      {position && (
        <Marker
          position={[position.lat, position.lon]}
          icon={customIcon}
          bubblingMouseEvents={false}
          zIndexOffset={2000}
        >
          <Tooltip
            permanent
            direction="top"
            offset={[0, -30]}
            interactive
            className="custom-tooltip"
          >
            <div style={{ fontWeight: 600, fontSize: "13px" }}>
              📍 Lat: {position.lat.toFixed(5)}
              <br />
              📍 Lon: {position.lon.toFixed(5)}
              {closestProject && (
                <>
                  <hr style={{ margin: "6px 0" }} />

                  <div
                    style={{
                      fontSize: "12px",
                      fontWeight: 700,
                      color: "#111827",
                    }}
                  >
                    📌 Proyecto más cercano
                  </div>

                  <div style={{ fontSize: "12px" }}>
                    📍 Lat: {closestProject.location.lat.toFixed(5)}
                    <br />
                    📍 Lon: {closestProject.location.lon.toFixed(5)}
                  </div>

                  <div
                    style={{
                      fontSize: "12px",
                      color: "#16a34a",
                      fontWeight: 700,
                    }}
                  >
                    📏 Distancia: {closestProject.distance.toFixed(2)} m
                  </div>

                  <div style={{ fontSize: "12px", color: "#6b7280" }}>
                    📌 Referencia: {closestProject.location.meter ?? "N/A"}
                  </div>
                </>
              )}
            </div>
          </Tooltip>
        </Marker>
      )}
    </>
  );
});

function AddMarkerMode({
  onSelect,
  onCancel,
}: {
  onSelect: (pos: [number, number]) => void;
  onCancel: () => void;
}) {
  const [position, setPosition] = useState<[number, number] | null>(null);
  const [waiting, setWaiting] = useState(false);

  useMapEvents({
    mousemove(e: any) {
      setPosition([e.latlng.lat, e.latlng.lng]);
    },
    click: async (e: any) => {
      if (waiting) return;
      const pos: [number, number] = [e.latlng.lat, e.latlng.lng];
      setWaiting(true);
      onSelect(pos);
    },
  });

  return position ? (
    <div className="coordinates-indicator">
      📍 {position[0].toFixed(5)}, {position[1].toFixed(5)}
      {waiting && " (guardando...)"}
    </div>
  ) : null;
}

const AddMarkersOnClick = React.memo(function AddMarkersOnClick({
  addingMode,
  setAddingMode,
  setMarkers,
  openModal,
}: {
  addingMode: boolean;
  setAddingMode: (v: boolean) => void;
  setMarkers: React.Dispatch<React.SetStateAction<MarkerWithIcon[]>>;
  openModal: () => void;
}) {
  useMapEvent("click", (e) => {
    if (!addingMode) return;

    const icon = L.icon({
      iconUrl: "https://cdn-icons-png.flaticon.com/512/684/684908.png",
      iconSize: [38, 38],
      iconAnchor: [19, 38],
    });

    const newMarker: MarkerWithIcon = {
      id: Date.now(),
      position: [e.latlng.lat, e.latlng.lng],
      icon,
    };

    openModal();
    setAddingMode(false);
  });

  return null;
});

// ---------------------------------------------------------------------------
// 🔥 Componente principal
// ---------------------------------------------------------------------------
function GpsMap({
  files,
  currentTime,
  onSelectPoint,
  startKm,
  legend,
  selectedPosition,
  visibleGroups,
  setOpenPreview,
  setSelectComment,
  setOpenNewCommentDialog,
  newPosition,
  setNewPosition,
  visibleTags,
  projectLocations,
}: {
  files: (File & { gpsPoints: GpsPoint[] })[];
  setSelectComment: React.Dispatch<React.SetStateAction<any | null>>;
  setOpenNewCommentDialog: React.Dispatch<React.SetStateAction<boolean>>;
  currentTime: { second: number; fileId: number; fileIndex: number };
  onSelectPoint: (p: {
    second: number;
    fileId: number;
    fileIndex: number;
  }) => void;
  setOpenPreview: React.Dispatch<React.SetStateAction<boolean>>;
  startKm: number;
  legend: PointMarker[];
  selectedPosition?: { lat: number; lon: number } | null;
  visibleGroups: Record<number, boolean>;
  newPosition: any;
  setNewPosition: any;
  visibleTags: Record<number, boolean>;
  projectLocations: ProjectLocation[];
}) {
  const polyline = useMemo<[number, number][]>(
    () =>
      files
        .slice()
        .sort((a, b) => a.order - b.order)
        .flatMap((file) =>
          file.gpsPoints
            .slice()
            .sort((a, b) => a.second - b.second)
            .map((p): [number, number] => [p.lat, p.lon]),
        ),
    [files],
  );

  const center = useMemo<[number, number]>(() => {
    if (!files[0] || !files[0].gpsPoints[0]) return [0, 0];
    return [files[0].gpsPoints[0].lat, files[0].gpsPoints[0].lon];
  }, [files]);

  const memoOnSelectPoint = useCallback(
    (v: { second: number; fileId: number; fileIndex: number }) =>
      onSelectPoint(v),
    [onSelectPoint],
  );

  const [markers, setMarkers] = useState<MarkerWithIcon[]>([]);
  const [addingMode, setAddingMode] = useState(false);

  // 🔥 Índice ordenado de projectLocations — se computa UNA sola vez
  const sortedProjectLocations = useMemo(
    () => buildSortedIndex(projectLocations),
    [projectLocations],
  );

  const allGpsPoints = useMemo<GpsPointWithFile[]>(
    () =>
      files.flatMap((file, fileIndex) =>
        file.gpsPoints.map((p) => ({
          ...p,
          fileId: file.id,
          fileIndex,
        })),
      ),
    [files],
  );

  // 🔥 onSelectPosition usa el índice pre-ordenado
  const onSelectPosition = useCallback(
    (pos: [number, number]) => {
      const { location, distance } = findClosestInIndex(
        sortedProjectLocations,
        pos[0],
        pos[1],
      );

      const referenceMeter = location.meter ?? 0;
      setNewPosition([pos[0], pos[1], referenceMeter]);
      setAddingMode(false);
    },
    [sortedProjectLocations, setNewPosition],
  );

  const onCancelAdding = useCallback(() => {
    setAddingMode(false);
  }, []);

  useEffect(() => {
    const mapContainer =
      document.querySelector<HTMLDivElement>(".leaflet-container");

    if (!mapContainer) return;

    mapContainer.style.cursor = addingMode ? "crosshair" : "";
  }, [addingMode]);

  if (!files.length) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
          <p className="mt-4 text-gray-600 font-medium">
            Cargando puntos GPS...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        position: "relative",
        height: "100%",
        width: "100%",
      }}
    >
      <StyleInjector />

      <MapContainer
        center={center}
        zoom={18}
        maxZoom={21}
        scrollWheelZoom={true}
        zoomDelta={0.5}
        zoomSnap={0.5}
        wheelDebounceTime={20}
        wheelPxPerZoomLevel={120}
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          url="https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}"
          maxZoom={21}
          maxNativeZoom={19}
          noWrap={true}
        />

        <ProjectLocationsLayer locations={projectLocations} />

        {polyline.length > 0 && (
          <>
            <Polyline
              positions={polyline}
              pathOptions={{ color: "black", weight: 12, opacity: 0.2 }}
            />
            <Polyline
              positions={polyline}
              pathOptions={{ color: "#3b82f6", weight: 4, opacity: 0.8 }}
            />
            <Polyline
              positions={polyline}
              pathOptions={{ color: "white", weight: 2, opacity: 0.6 }}
            />
          </>
        )}

        {addingMode && (
          <AddMarkerMode
            onSelect={onSelectPosition}
            onCancel={onCancelAdding}
          />
        )}

        <DraggablePointer
          markers={markers}
          setMarkers={setMarkers}
          addingMode={addingMode}
          setAddingMode={setAddingMode}
        />

        <SelectedPositionEffect selectedPosition={selectedPosition} />

        <LegendMarkers
          legend={legend}
          visibleGroups={visibleGroups}
          selectedPosition={selectedPosition}
          onSelectPoint={onSelectPoint}
          openPreview={(e: any) => {
            setSelectComment(e);
            setOpenPreview(true);
          }}
          visibleTags={visibleTags}
          allGpsPoints={allGpsPoints}
        />

        <MarkerUpdater
          files={files}
          currentTime={currentTime}
          onSelectPoint={memoOnSelectPoint}
          startKm={startKm}
          projectLocations={projectLocations}
          sortedProjectLocations={sortedProjectLocations}
        />

        <AddMarkersOnClick
          addingMode={addingMode}
          setAddingMode={setAddingMode}
          setMarkers={setMarkers}
          openModal={() => setOpenNewCommentDialog(true)}
        />

        {markers.map((m) => (
          <Marker key={m.id} position={m.position} icon={m.icon}>
            <Tooltip className="custom-tooltip"></Tooltip>
          </Marker>
        ))}
      </MapContainer>

      {addingMode && <div className="adding-mode-overlay" />}

      {addingMode ? (
        <button
          onClick={() => setAddingMode(false)}
          className="map-control-button"
          style={{
            position: "absolute",
            bottom: 20,
            right: 20,
            zIndex: 1000,
            background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
            color: "white",
          }}
        >
          ✕ Cancelar
        </button>
      ) : (
        <button
          onClick={() => setAddingMode(true)}
          className="map-control-button"
          style={{
            position: "absolute",
            bottom: 20,
            right: 20,
            zIndex: 1000,
            background: "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",
            color: "white",
          }}
        >
          + Añadir Marcador
        </button>
      )}
    </div>
  );
}

export default React.memo(GpsMap);
