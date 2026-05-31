"use client";

import { usePreviewMode, usePreviewSearchParam } from "@/components/bjork-ui/use-preview-mode";
import { useState, useEffect } from "react";
import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { ServerManagementTable, type Server } from "@/components/bjork-ui/tables/server-management-table";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("server-management");

const initialServers: Server[] = [
  {
    id: "1",
    number: "01",
    serviceName: "VPS-2 (Windows)",
    osType: "windows",
    serviceLocation: "Frankfurt, Germany",
    countryCode: "de",
    ip: "198.51.100.211",
    dueDate: "14 Oct 2027",
    cpuPercentage: 80,
    status: "active"
  },
  {
    id: "2", 
    number: "02",
    serviceName: "VPS-1 (Windows)",
    osType: "windows",
    serviceLocation: "Frankfurt, Germany", 
    countryCode: "de",
    ip: "203.0.113.158",
    dueDate: "14 Oct 2027",
    cpuPercentage: 90,
    status: "active"
  },
  {
    id: "3",
    number: "03", 
    serviceName: "VPS-1 (Ubuntu)",
    osType: "ubuntu",
    serviceLocation: "Paris, France",
    countryCode: "fr",
    ip: "192.0.2.37",
    dueDate: "27 Jun 2027",
    cpuPercentage: 50,
    status: "paused"
  },
  {
    id: "4",
    number: "04",
    serviceName: "Server-1 (Ubuntu)", 
    osType: "ubuntu",
    serviceLocation: "Yokohama, Japan",
    countryCode: "jp",
    ip: "198.51.100.23",
    dueDate: "30 May 2030",
    cpuPercentage: 95,
    status: "active"
  },
  {
    id: "5",
    number: "05",
    serviceName: "Dedicated Server (Windows)",
    osType: "windows", 
    serviceLocation: "Abu Dhabi, UAE",
    countryCode: "us",
    ip: "203.0.113.45",
    dueDate: "15 Dec 2026",
    cpuPercentage: 0,
    status: "inactive"
  }
];

export default function ServerManagementTableDemo() {
  const isPreview = usePreviewMode();
  const previewTheme = usePreviewSearchParam("theme");
  const tableTheme = previewTheme === "light" || previewTheme === "dark" ? previewTheme : "auto";
  const [servers, setServers] = useState<Server[]>(initialServers);

  const handleStatusChange = (serverId: string, newStatus: "active" | "paused" | "inactive") => {
    console.log(`Server ${serverId} status changed to:`, newStatus);
    setServers(prev => prev.map(server => 
      server.id === serverId ? { ...server, status: newStatus } : server
    ));
  };

  // Update CPU percentages every 2 seconds for demo
  useEffect(() => {
    const interval = setInterval(() => {
      setServers(prev => prev.map(server => {
        // Only update active servers for realism
        if (server.status === "active") {
          const variation = (Math.random() - 0.5) * 20; // ±10% variation
          const newPercentage = Math.max(10, Math.min(100, server.cpuPercentage + variation));
          return { ...server, cpuPercentage: Math.round(newPercentage) };
        }
        // Inactive servers should be at 0% or very low
        if (server.status === "inactive") {
          return { ...server, cpuPercentage: 0 };
        }
        // Paused servers stay relatively stable with minor fluctuation
        const variation = (Math.random() - 0.5) * 5; // ±2.5% variation
        const newPercentage = Math.max(5, Math.min(70, server.cpuPercentage + variation));
        return { ...server, cpuPercentage: Math.round(newPercentage) };
      }));
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  return (
    <SimpleComponentDemoPage
      item={item}
      description="A server management table with live CPU bars, country metadata, status controls, and infrastructure-style row density."
      previewScaleClassName="w-[1320px] scale-[0.62]"
      previewInnerClassName="bg-[#f7f5ef] dark:bg-[#111]"
    >
      <ServerManagementTable
        servers={servers}
        onStatusChange={handleStatusChange}
        theme={tableTheme}
        enableAnimations={!isPreview}
      />
    </SimpleComponentDemoPage>
  );
}
