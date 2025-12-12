"use client";

import React, { useEffect, useRef, useState } from "react";
import "@egjs/view360/css/view360.css";
import View360, { ControlBar, EquirectProjection } from "@egjs/view360";
import ResumenCoordinates from "./resumen-coordinates";
import { GpsPoint } from "@prisma/client";
import CustomControls from "./CustomControls";

export interface GpxPoint {
  id: number;
  lat: number;
  lon: number;
  ele: number | null;
  second: string | null;
  offset?: number;
}

const Video360Section = React.memo(function Video360({
  url,
  currentTime,
  setCurrentTime,
  points,
  startKm,
}: {
  url: string;
  currentTime: any;
  setCurrentTime: any;
  points: GpsPoint[];
  startKm: number;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const viewerRef = useRef<any | null>(null);
  const [ready, setReady] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!videoUrl) return;

    const container = containerRef.current;
    const video = videoRef.current;
    if (!container || !video) return;

    const setupViewer = () => {
      viewerRef.current = new View360(container, {
        projection: new EquirectProjection({
          src: video,
          video: { autoplay: false, muted: true, loop: true },
        }),
        plugins: [
          new ControlBar({
            autoHide: false,
            playButton: true,
            progressBar: true,
            volumeButton: true,
            fullscreenButton: true,
          }),
        ],
      });

      const videoEl = viewerRef.current.projection.video;
      if (videoEl) {
        videoEl.muted = true;
        // No toques volume para evitar error
      }

      setReady(true);
    };

    video.addEventListener("loadedmetadata", setupViewer, { once: true });

    return () => {
      video.removeEventListener("loadedmetadata", setupViewer);
    };
  }, [videoUrl]);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let rafId: number;
    let lastRoundedTime = -1;

    const update = () => {
      const roundedTime = Math.round(video.currentTime * 10) / 10;

      if (roundedTime !== lastRoundedTime) {
        lastRoundedTime = roundedTime;
        setCurrentTime(roundedTime);
      }

      rafId = requestAnimationFrame(update);
    };

    rafId = requestAnimationFrame(update);

    return () => cancelAnimationFrame(rafId);
  }, [videoUrl]);

  useEffect(() => {
    if (url?.length === 0) {
      return;
    }
    async function fetchVideoUrl() {
      const res = await fetch(
        `/api/s3/getSignedUrl?key=${encodeURIComponent(url)}`,
      );
      const data = await res.json();
      setVideoUrl(data.url);
    }

    fetchVideoUrl();
  }, [url]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (Math.abs(video.currentTime - currentTime) > 0.05) {
      video.currentTime = currentTime;
    }
  }, [currentTime]);
  if (!videoUrl) return <p>Cargando video...</p>;

  return (
    <>
      <div
        style={{
          width: "100%",
          height: "100%",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: "1rem",
            left: "1rem",
            backgroundColor: "rgba(0,0,0,0.2)",
            color: "white",
            padding: "6px 10px",
            borderRadius: "6px",
            fontSize: "14px",
            zIndex: 100,
          }}
        >
          Tiempo: {currentTime.toFixed(2)} s
        </div>
        <div
          style={{
            position: "absolute",
            top: "4rem",
            left: "1rem",
            backgroundColor: "rgba(0,0,0,0.2)",
            color: "white",
            padding: "6px 10px",
            borderRadius: "6px",
            fontSize: "14px",
            zIndex: 50,
            pointerEvents: "none",
          }}
        >
          <ResumenCoordinates
            startKm={startKm}
            points={points}
            currentTime={currentTime}
          />
        </div>
        <div
          style={{
            flex: 1,
            height: "100%",
            width: "100%",
            backgroundColor: "black",
            overflow: "hidden",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            ref={containerRef}
            id="view360-container"
            style={{
              width: "100%",
              height: "100%",
            }}
          >
            <canvas
              className="view360-canvas"
              style={{
                width: "100%",
                height: "100%",
                display: "block",
              }}
            />

            <div
              style={{
                position: "absolute",
                bottom: "5rem",
                width: "100%",
                display: "flex",
                justifyContent: "center",
                zIndex: 50,
              }}
            >
              <CustomControls videoRef={videoRef} viewerRef={viewerRef} />
            </div>
          </div>
        </div>

        <video
          ref={videoRef}
          src={videoUrl}
          playsInline
          crossOrigin="anonymous"
          controls
          style={{
            display: "none",
            width: "480px",
            height: "270px",
            objectFit: "cover",
            position: "absolute",
            bottom: "1rem",
            right: "1rem",
          }}
        />
      </div>
    </>
  );
});
export default Video360Section;
