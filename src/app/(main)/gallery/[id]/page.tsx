"use client";

import React, { useMemo, useState, useCallback, useEffect } from "react";
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
import dynamic from "next/dynamic";
import { useSession } from "next-auth/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import {
  File,
  GpsPoint,
  PointMarker,
  Project,
  Tag as Itag,
} from "@prisma/client";

const GpsMap = dynamic(() => import("@/app/components/GpsMap"), {
  ssr: false,
});

export type FileResponse = Omit<File, "tags"> & {
  gpsPoints: GpsPoint[];
  project:
    | (Project & {
        PointMarker: (PointMarker & {
          marker: any;
        })[];
      })
    | null;
  tags: Itag[];
};

export default function GalleryPreviewPage() {
  const { data: session, status } = useSession();
  const params = useParams();
  const fileId = useMemo(
    () => (params.id ? Number(params.id) : null),
    [params.id],
  );
  const queryClient = useQueryClient();

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

  // Query para archivo
  const fileQuery = useQuery<FileResponse, Error>({
    queryKey: ["file", fileId],
    queryFn: async () => {
      if (!fileId) throw new Error("ID de archivo inválido");
      const res = await fetch(`/api/file/${fileId}`);
      if (!res.ok) throw new Error("Error al obtener archivo");
      return res.json();
    },
    enabled: !!fileId,
  });

  // Actualizar startKm cuando cambien los datos
  useEffect(() => {
    if (fileQuery.data?.startPlace != null) {
      setStartKm(Number(fileQuery.data.startPlace));
    }
  }, [fileQuery.data]);

  // Query para tags
  const tagsQuery = useQuery<Itag[], Error>({
    queryKey: ["tags"],
    queryFn: async () => {
      const res = await fetch("/api/tag");
      if (!res.ok) throw new Error("Error al obtener tags");
      return res.json();
    },
  });

  // Función de búsqueda optimizada
  const searchPoints = useCallback(
    (e: { query: string }) => {
      if (!fileQuery.data?.gpsPoints) return;
      const query = e.query.trim().toLowerCase();
      const results = fileQuery.data.gpsPoints.filter((p) => {
        const dist = startKm + p.totalDistance;
        return formatDistance(dist).toLowerCase().includes(query);
      });
      setFilteredSuggestions(results.slice(0, 30));
    },
    [fileQuery.data?.gpsPoints, startKm],
  );

  const handleSelectLegendPoint = useCallback(
    (pos: { lat: number; lon: number }) => {
      setSelectedLegendPoint(pos);
    },
    [],
  );

  const pointsMarkers = useMemo(() => {
    return fileQuery.data?.project?.PointMarker ?? [];
  }, [fileQuery.data?.project?.PointMarker]);

  if (fileQuery.error)
    return <div>Error cargando archivo: {fileQuery.error.message}</div>;
  if (tagsQuery.error)
    return <div>Error cargando tags: {tagsQuery.error.message}</div>;
  if (fileQuery.isLoading || tagsQuery.isLoading || status === "loading")
    return <FullPageLoading />;
  if (!session) return <div>No estás autenticado</div>;

  return (
    <div className="w-full h-full flex p-2 flex-col">
      <div className="flex flex-1 overflow-hidden w-full">
        {/* Izquierda */}
        <div className="flex flex-col w-1/2">
          <div className="w-full p-3 border-b bg-white flex items-center gap-4 shadow-sm rounded-t">
            <div className="flex flex-col justify-center ">
              <h2 className="text-base font-bold text-gray-800 leading-tight">
                {fileQuery.data?.fileName ?? "Cargando archivo..."}
              </h2>

              {fileQuery.data?.startPlace && (
                <span className="text-xs text-gray-600 leading-tight">
                  Inicio:{" "}
                  <span className="font-semibold">
                    {fileQuery.data.startPlace}
                  </span>
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
              {fileQuery.data?.tags?.map((tag) => (
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
            url={fileQuery.data?.fileName ?? ""}
            currentTime={currentTime}
            setCurrentTime={setCurrentTime}
            points={fileQuery.data?.gpsPoints ?? []}
            startKm={startKm}
          />
        </div>

        {/* Derecha */}
        <div className="w-1/2 bg-white border-l h-full flex flex-col overflow-auto">
          <SidebarLegend
            tags={tagsQuery.data || []}
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
              points={fileQuery.data?.gpsPoints ?? []}
              currentTime={currentTime}
              selectedPosition={selectedLegendPoint}
              setOpenPreview={setOpenPreviewDialog}
              setSelectComment={setSelectComment}
              setOpenNewCommentDialog={setOpenNewCommentDialog}
            />
          </div>
        </div>

        {/* Diálogos */}
        <CommentPreviewDialog
          visible={openPreviewDialog}
          pointMarker={selectComment}
          tags={tagsQuery.data || []}
          defaultTags={fileQuery.data?.tags || []}
          onHide={() => setOpenPreviewDialog(false)}
          onSubmitReply={async (comment, pdf, tags, parentId) => {
            try {
              let urlFile = null;
              const createdById = Number(session?.user?.id);

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
              queryClient.invalidateQueries({ queryKey: ["file", fileId] });
            } catch (error) {
              console.error("Error en submit respuesta:", error);
            }
          }}
        />

        <NewCommentDialog
          tags={tagsQuery.data || []}
          defaultTags={fileQuery.data?.tags || []}
          visible={openNewCommentDialog}
          newPosition={newPosition}
          onHide={() => setOpenNewCommentDialog(false)}
          onSubmit={async ({ comment, tags, marker, file: pdf }) => {
            try {
              let urlFile = null;
              const createdById = Number(session?.user?.id);

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
                  projectId: fileQuery.data?.projectId,
                  markerId: marker?.id,
                  lat: newPosition?.[0],
                  lon: newPosition?.[1],
                  tags,
                }),
              });

              if (!res.ok) throw new Error("Error creando comentario");

              setOpenNewCommentDialog(false);
              queryClient.invalidateQueries({ queryKey: ["file", fileId] });
            } catch (error) {
              console.error("Error en submit comentario:", error);
            }
          }}
        />
      </div>
    </div>
  );
}
