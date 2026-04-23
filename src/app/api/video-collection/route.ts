import { NextResponse } from "next/server";
import db from "@/lib/db";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = Number(session.user.id);

    const userWithCompanies = await db.user.findUnique({
      where: { id: userId },
      include: { UserCompany: { include: { company: true } } },
    });

    if (!userWithCompanies) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const companyIds = userWithCompanies.UserCompany.map((uc) => uc.companyId);

    const files = await db.videoCollection.findMany({
      where: {
        project: {
          companyId: { in: companyIds },
        },
      },
      include: {
        project: true,
        files: true,
      },
    });

    return NextResponse.json(files);
  } catch (error) {
    console.error("Error fetching files:", error);
    return NextResponse.json(
      { error: "Error fetching files" },
      { status: 500 },
    );
  }
}
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      projectId,
      name,
      date,
      tagIds,
    }: { projectId: number; name: string; date: string; tagIds: number[] } =
      body;

    if (!projectId || !name) {
      return NextResponse.json(
        { error: "projectId y name son requeridos" },
        { status: 400 },
      );
    }

    const collection = await db.videoCollection.create({
      data: {
        projectId,
        name,
        date: new Date(date),
        tagIds,
      },
    });

    console.log(collection);

    return NextResponse.json(collection, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Error al crear VideoCollection" },
      { status: 500 },
    );
  }
}
