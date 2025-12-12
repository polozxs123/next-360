"use client";
import SidebarLegend from "../components/SidebarLegend";
import Sidebar from "../components/Sidebar";
import { SessionProvider } from "next-auth/react";
const queryClient = new QueryClient();

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex">
      <Sidebar />

      <main className="flex-1 overflow-y-auto bg-gray-50">
        <SessionProvider>
          <QueryClientProvider client={queryClient}>
            {children}
          </QueryClientProvider>
        </SessionProvider>
      </main>
    </div>
  );
}
