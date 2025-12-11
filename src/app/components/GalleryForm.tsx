"use client";

import { useEffect, useState, useRef } from "react";
import { useFormik } from "formik";
import { z } from "zod";
import { InputText } from "primereact/inputtext";
import { FileUpload } from "primereact/fileupload";
import { FloatLabel } from "primereact/floatlabel";
import { Button } from "primereact/button";
import { Dropdown } from "primereact/dropdown";
import { MultiSelect } from "primereact/multiselect";
import { Toast } from "primereact/toast";
import { uploadFileDirectlyToS3 } from "../lib/uploadToS3";

const videoSchema = z.object({
  startPlace: z.string().min(1, "Lugar requerido"),
  fileName: z.string().min(1, "Nombre requerido"),
  file: z
    .instanceof(File, { message: "Debe seleccionar un archivo válido" })
    .optional(),
  gps: z
    .instanceof(File, { message: "Debe seleccionar un archivo gps válido" })
    .optional(),
  projectId: z.number(),
  tags: z.array(z.number()).optional(),
  id: z.number().optional(),
});

type VideoForm = z.infer<typeof videoSchema>;

type Props = {
  initialData?: Partial<VideoForm>;
  onCloseModal?: () => void; // función para cerrar modal
};

type Project = { id: number; name: string };
type Tag = { id: number; name: string };

export default function GalleryForm({ initialData, onCloseModal }: Props) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const toast = useRef<Toast>(null);

  useEffect(() => {
    async function fetchProjects() {
      const res = await fetch("/api/project");
      if (res.ok) {
        const data = await res.json();
        setProjects(data);
      }
    }
    async function fetchTags() {
      const res = await fetch("/api/tag");
      if (res.ok) {
        const data = await res.json();
        setTags(data);
      }
    }
    fetchProjects();
    fetchTags();
  }, []);

  const formik = useFormik<VideoForm>({
    initialValues: {
      startPlace: initialData?.startPlace || "",
      fileName: initialData?.fileName || "",
      file: undefined,
      gps: undefined,
      projectId: initialData?.projectId || 0,
      tags: initialData?.tags || [],
      id: initialData?.id,
    },
    onSubmit: async (values, { setErrors, setSubmitting }) => {
      setSubmitting(true);
      try {
        let fileKey: string | undefined;
        if (values.file) {
          fileKey = await uploadFileDirectlyToS3(
            values.file,
            values.fileName + ".mp4",
          );
        }

        let gpsKey: string | undefined;
        if (values.gps) {
          gpsKey = await uploadFileDirectlyToS3(
            values.gps,
            values.fileName + ".gpx",
          );
        }

        const method = values.id ? "PUT" : "POST";
        const url = "/api/upload";

        const body = {
          id: values.id,
          startPlace: values.startPlace,
          fileName: values.fileName,
          fileKey,
          gpsKey,
          projectId: values.projectId,
          tagIds: values.tags || [],
        };

        const response = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(
            errorData.error || "Error al subir o procesar archivo.",
          );
        }

        const result = await response.json();

        toast.current?.show({
          severity: "success",
          summary: "Éxito",
          detail: "Archivo subido correctamente",
          life: 3000,
        });

        if (onCloseModal) onCloseModal();
      } catch (err: any) {
        console.error(err);
        toast.current?.show({
          severity: "error",
          summary: "Error",
          detail: err.message || "Error al subir o procesar archivo.",
          life: 4000,
        });
        setErrors({
          fileName: err.message || "Error al subir o procesar archivo.",
        });
      } finally {
        setSubmitting(false);
      }
    },
  });

  return (
    <div className="flex justify-center w-full h-full ">
      <Toast ref={toast} />
      <form
        onSubmit={formik.handleSubmit}
        className="flex flex-col gap-6 bg-white  rounded-2xl shadow-xl w-full"
      >
        <FloatLabel>
          <InputText
            id="startPlace"
            value={formik.values.startPlace}
            onChange={formik.handleChange}
            type="number"
            className="w-full"
          />
          <label htmlFor="startPlace">Kilometro de Inicio</label>
        </FloatLabel>
        {formik.touched.startPlace && formik.errors.startPlace && (
          <small className="text-red-500">{formik.errors.startPlace}</small>
        )}

        <FloatLabel>
          <InputText
            id="fileName"
            value={formik.values.fileName}
            onChange={formik.handleChange}
            className="w-full"
          />
          <label htmlFor="fileName">Nombre del Archivo</label>
        </FloatLabel>
        {formik.touched.fileName && formik.errors.fileName && (
          <small className="text-red-500">{formik.errors.fileName}</small>
        )}

        <div className="flex flex-col gap-2">
          <label className="text-gray-700 font-medium">Proyecto</label>
          <Dropdown
            options={projects}
            value={
              projects.find((p) => p.id === formik.values.projectId) || null
            }
            onChange={(e) => formik.setFieldValue("projectId", e.value.id)}
            optionLabel="name"
            placeholder="Seleccionar proyecto"
            className="w-full"
            dropdownIcon="pi pi-chevron-down"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-gray-700 font-medium">Tags</label>
          <MultiSelect
            value={formik.values.tags}
            options={tags.map((tag) => ({ label: tag.name, value: tag.id }))}
            onChange={(e) => formik.setFieldValue("tags", e.value)}
            placeholder="Selecciona los tags"
            display="chip"
            className="w-full"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-gray-700 font-medium">Archivo MP4</label>
          <FileUpload
            mode="basic"
            accept=".mp4"
            customUpload
            auto
            chooseLabel="Seleccionar Video"
            className="w-full [&>span]:w-full [&>span]:justify-center"
            chooseOptions={{ className: "w-full" }}
            onSelect={(e) => formik.setFieldValue("file", e.files?.[0])}
          />
          {formik.values.file && (
            <span className="text-sm text-gray-600">
              Seleccionado: <b>{formik.values.file.name}</b>
            </span>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-gray-700 font-medium">Archivo GPX</label>
          <FileUpload
            mode="basic"
            accept=".gpx"
            customUpload
            auto
            chooseLabel="Seleccionar Archivo GPX"
            className="w-full [&>span]:w-full [&>span]:justify-center"
            chooseOptions={{ className: "w-full" }}
            onSelect={(e) => formik.setFieldValue("gps", e.files?.[0])}
          />
          {formik.values.gps && (
            <span className="text-sm text-gray-600">
              Seleccionado: <b>{formik.values.gps.name}</b>
            </span>
          )}
        </div>

        <Button
          label={
            formik.isSubmitting
              ? "Enviando..."
              : formik.values.id
                ? "Actualizar"
                : "Guardar"
          }
          type="submit"
          className="w-full"
          disabled={formik.isSubmitting}
          loading={formik.isSubmitting}
        />
      </form>
    </div>
  );
}
