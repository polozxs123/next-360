"use client";

import { Card } from "primereact/card";
import { useRouter } from "next/navigation";

const menu = [
  {
    id: 1,
    label: "Usuarios",
    path: "/user",
    description: "Gestiona usuarios, roles y permisos del sistema.",
  },
  {
    id: 2,

    label: "Galería",
    path: "/gallery",
    description: "Visualiza y administra videos y archivos multimedia.",
  },
  {
    id: 3,

    label: "Marcadores",
    path: "/marker",
    description: "Gestiona puntos de interés y marcadores en el mapa.",
  },
  {
    id: 4,

    label: "Proyectos",
    path: "/project",
    description: "Crea y administra proyectos relacionados con tus rutas.",
  },
];

export default function HomePage() {
  const router = useRouter();

  return (
    <>
      <div
        className={`
          w-full h-full relative flex flex-col items-center justify-center
          bg-gradient-to-r 
        `}
      >
        <video
          autoPlay
          loop
          muted
          playsInline
          className="absolute w-full h-full object-cover brightness-75"
        >
          <source src="/videos/background.mp4" type="video/mp4" />
        </video>

        {/* Contenedor de título */}
        <div className="mb-12 z-20 text-center px-6 max-w-4xl">
          <h1 className="text-6xl font-extrabold text-white tracking-tight mb-3 drop-shadow-lg animate-fadeInUp">
            Visor360
          </h1>
          <p className="text-xl text-white/90 max-w-3xl mx-auto drop-shadow-md animate-fadeInUp animate-delay-200">
            Monitorea rutas, analiza carreteras y sigue tus trayectos en tiempo
            real con precisión GPS y visualización moderna.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-8 px-6 max-w-7xl w-full z-20">
          {menu.map(({ id, label, path, description }) => (
            <div
              key={id}
              onClick={() => router.push(path as any)}
              className="shadow-2xl p-5 cursor-pointer"
              style={{ minHeight: "200px" }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ")
                  router.push(path as any);
              }}
            >
              <h3 className="text-3xl font-semibold text-white drop-shadow-md">
                {label}
              </h3>
              <p className="text-md text-white/90 drop-shadow-md">
                {description}
              </p>
            </div>
          ))}
        </div>

        {/* Animaciones Tailwind personalizadas */}
        <style jsx>{`
          @keyframes fadeInUp {
            0% {
              opacity: 0;
              transform: translateY(20px);
            }
            100% {
              opacity: 1;
              transform: translateY(0);
            }
          }
          .animate-fadeInUp {
            animation: fadeInUp 0.7s ease forwards;
          }
          .animate-delay-200 {
            animation-delay: 0.2s;
          }
        `}</style>
      </div>
    </>
  );
}
