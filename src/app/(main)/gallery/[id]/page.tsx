"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useParams } from "next/navigation";
import { AutoComplete } from "primereact/autocomplete";
import { Tag } from "primereact/tag";
import PointTemplate from "@/app/components/PointTemplate";
import { formatDistance } from "@/app/utis/formatDistance";
import CommentPreviewDialog from "@/app/components/CommentPreviewDialog";
import NewCommentDialog from "@/app/components/NewCommentDialog";
import { uploadFileDirectlyToS3 } from "@/app/lib/uploadToS3";
import SidebarLegend from "@/app/components/SidebarLegend";
import { FullPageLoading } from "@/app/components/FullPageLoading";
import Video360Section from "@/app/components/Video360";
import {
  File,
  GpsPoint,
  PointMarker,
  Project,
  Tag as Itag,
} from "@prisma/client";

import dynamic from "next/dynamic";

const GpsMap = dynamic(() => import("@/app/components/GpsMap"), {
  ssr: false, // Solo en cliente
});

export type FileResponse = Omit<File, "tags"> & {
  gpsPoints: GpsPoint[];
  project:
    | (Project & {
        PointMarker: (PointMarker & {
          marker: any; // Ajusta el tipo si tienes uno más específico
        })[];
      })
    | null;
  tags: Itag[];
};

export default function GalleryPreviewPage() {
  const params = useParams();
  const fileId = useMemo(
    () => (params.id ? Number(params.id) : null),
    [params.id],
  );

  // Estados de datos
  const [file, setFile] = useState<FileResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const [tagsOptions, setTagsOptions] = useState<Itag[]>([]);
  const [isLoadingTags, setIsLoadingTags] = useState(false);

  // Estados UI y lógicos
  const [currentTime, setCurrentTime] = useState(0);
  const [startKm, setStartKm] = useState(0);
  const [search, setSearch] = useState("");
  const [filteredSuggestions, setFilteredSuggestions] = useState<GpsPoint[]>(
    [],
  );
  const [selectedLegendPoint, setSelectedLegendPoint] = useState<{
    lat: number;
    lon: number;
  } | null>(null);
  const [visibleGroups, setVisibleGroups] = useState<Record<number, boolean>>(
    {},
  );
  const [openPreviewDialog, setOpenPreviewDialog] = useState(false);
  const [openNewCommentDialog, setOpenNewCommentDialog] = useState(false);
  const [selectComment, setSelectComment] = useState<any | null>(null);
  const [newPosition, setNewPosition] = useState<[number, number] | null>(null);

  // Fetch file by id
  const fetchFile = useCallback(async () => {
    if (!fileId) return;
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/file/${fileId}`);
      if (!res.ok) throw new Error("Error al obtener el archivo");
      const data = await res.json();
      setFile(data);
      if (data?.startPlace != null) setStartKm(Number(data.startPlace));
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, [fileId]);

  // Fetch tags
  const fetchTags = useCallback(async () => {
    setIsLoadingTags(true);
    try {
      const res = await fetch("/api/tag");
      if (!res.ok) throw new Error("Error al obtener tags");
      const data = await res.json();
      setTagsOptions(data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingTags(false);
    }
  }, []);

  // Al montar, carga datos
  useEffect(() => {
    fetchFile();
    fetchTags();
  }, [fetchFile, fetchTags]);

  // Búsqueda optimizada usando useCallback
  const searchPoints = useCallback(
    (e: { query: string }) => {
      if (!file?.gpsPoints) return;
      const query = e.query.trim().toLowerCase();

      // Filtrar puntos que contengan la búsqueda en la distancia formateada
      const results = file.gpsPoints.filter((p) => {
        const dist = startKm + p.totalDistance;
        return formatDistance(dist).toLowerCase().includes(query);
      });

      setFilteredSuggestions(results.slice(0, 30));
    },
    [file?.gpsPoints, startKm],
  );

  // Manejo selección punto leyenda
  const handleSelectLegendPoint = useCallback(
    (pos: { lat: number; lon: number }) => {
      setSelectedLegendPoint(pos);
    },
    [],
  );

  // Memorizar los puntos marcadores para no recalcular
  const pointsMarkers = useMemo(() => {
    return file?.project?.PointMarker ?? [];
  }, [file?.project?.PointMarker]);

  if (error) {
    return <div>Error cargando datos: {error.message}</div>;
  }
  if (isLoading || isLoadingTags) {
    return <FullPageLoading />;
  }

  return (
    <div className="w-full h-full flex p-2 flex-col">
      <div className="flex flex-1 overflow-hidden w-full">
        {/* Izquierda */}
        <div className="flex flex-col w-1/2">
          <div className="w-full p-3 border-b bg-white flex items-center gap-4 shadow-sm rounded-t">
            <div className="flex flex-col justify-center ">
              <h2 className="text-base font-bold text-gray-800 leading-tight">
                {file?.fileName ?? "Cargando archivo..."}
              </h2>

              {file?.startPlace && (
                <span className="text-xs text-gray-600 leading-tight">
                  Inicio:{" "}
                  <span className="font-semibold">{file.startPlace}</span>
                </span>
              )}
            </div>

            <div className="flex-2 w-full">
              <AutoComplete
                value={search}
                suggestions={filteredSuggestions}
                completeMethod={searchPoints}
                field=""
                itemTemplate={(e) => (
                  <PointTemplate p={e as any} startKm={startKm} />
                )}
                onChange={(e) => setSearch(e.value as any)}
                onSelect={(e) => {
                  const p = e.value as GpsPoint;
                  setSearch(formatDistance(startKm + p.totalDistance));
                  setCurrentTime(p.second);
                }}
                className="!w-full"
                placeholder="Buscar distancia..."
                inputClassName="!w-full text-sm"
              />
            </div>

            <div>
              {file?.tags?.map((tag) => (
                <Tag
                  key={tag.id}
                  value={tag.name}
                  style={{ backgroundColor: `#${tag.color}`, color: "white" }}
                  rounded
                />
              ))}
            </div>
          </div>

          <Video360Section
            url={file?.fileName ?? ""}
            currentTime={currentTime}
            setCurrentTime={setCurrentTime}
            points={file?.gpsPoints ?? []}
            startKm={startKm}
          />
        </div>

        {/* Derecha */}
        <div className="w-1/2 bg-white border-l h-full flex flex-col overflow-auto">
          <SidebarLegend
            tags={tagsOptions}
            pointsMarkers={pointsMarkers}
            onSelectPosition={handleSelectLegendPoint}
            visibleGroups={visibleGroups}
            setVisibleGroups={setVisibleGroups}
          />

          <div className="shadow-lg p-4 rounded-xl w-full h-full flex-1 min-h-0">
            <GpsMap
              newPosition={newPosition}
              setNewPosition={setNewPosition}
              visibleGroups={visibleGroups}
              legend={pointsMarkers}
              startKm={startKm}
              setCurrentTime={setCurrentTime}
              points={file?.gpsPoints ?? []}
              currentTime={currentTime}
              selectedPosition={selectedLegendPoint}
              setOpenPreview={setOpenPreviewDialog}
              setSelectComment={setSelectComment}
              setOpenNewCommentDialog={setOpenNewCommentDialog}
            />
          </div>
        </div>

        {/* Dialogos */}
        <CommentPreviewDialog
          visible={openPreviewDialog}
          pointMarker={selectComment}
          tags={tagsOptions}
          defaultTags={file?.tags || []}
          onHide={() => setOpenPreviewDialog(false)}
          onSubmitReply={async (comment, pdf, tags, parentId) => {
            try {
              let urlFile = null;
              const createdById = 1;
              if (pdf) {
                urlFile = await uploadFileDirectlyToS3(pdf, pdf.name);
              }
              const res = await fetch("/api/point-marker/reply", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  parentId,
                  comment,
                  urlFile,
                  createdById,
                  tags,
                }),
              });

              if (!res.ok) throw new Error("Error creando respuesta");

              setOpenPreviewDialog(false);
              fetchFile(); // recarga data
            } catch (error) {
              console.error("Error en submit respuesta:", error);
            }
          }}
        />

        <NewCommentDialog
          tags={tagsOptions}
          defaultTags={file?.tags || []}
          visible={openNewCommentDialog}
          newPosition={newPosition}
          onHide={() => setOpenNewCommentDialog(false)}
          onSubmit={async ({ comment, tags, marker, file: pdf }) => {
            try {
              let urlFile = null;
              const createdById = 1;
              if (pdf) {
                urlFile = await uploadFileDirectlyToS3(pdf, pdf.name);
              }
              const res = await fetch("/api/point-marker", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  comment,
                  createdById,
                  urlFile,
                  projectId: file?.projectId,
                  markerId: marker?.id,
                  lat: newPosition?.[0],
                  lon: newPosition?.[1],
                  tags,
                }),
              });
              if (!res.ok) throw new Error("Error creando comentario");

              setOpenNewCommentDialog(false);
              fetchFile(); // recarga data
            } catch (error) {
              console.error("Error en submit comentario:", error);
            }
          }}
        />
      </div>
    </div>
  );
}
