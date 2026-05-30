"use client";

import { useState, useEffect } from "react";
import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import { LeadsTable, type Lead } from "@/components/isaiahbjork/tables/leads-table";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("leads-table");

const initialLeads: Lead[] = [
  {
    id: "1",
    name: "Andy Shepard",
    email: "a.shepard@gmail.com",
    source: "ORGANIC",
    sourceType: "organic",
    status: "pre-sale",
    size: 120000,
    interest: [45, 52, 48, 55, 58, 60, 57, 62, 65, 63],
    probability: "mid",
    lastAction: "Sep 12, 2024"
  },
  {
    id: "2", 
    name: "Emily Thompson",
    email: "emily.thompson@company.com",
    source: "SB2024",
    sourceType: "campaign",
    status: "closed",
    size: 200000,
    interest: [30, 35, 42, 48, 55, 62, 68, 70, 75, 78],
    probability: "high",
    lastAction: "Sep 13, 2024"
  },
  {
    id: "3",
    name: "Michael Carter",
    email: "m.carter@business.co", 
    source: "SUMMER2",
    sourceType: "campaign",
    status: "pre-sale",
    size: 45000,
    interest: [70, 68, 65, 60, 58, 55, 52, 48, 45, 42],
    probability: "low",
    lastAction: "Sep 12, 2024"
  },
  {
    id: "4",
    name: "David Anderson", 
    email: "david@enterprise.com",
    source: "DTJ25",
    sourceType: "campaign",
    status: "pre-sale",
    size: 80000,
    interest: [25, 28, 32, 38, 45, 52, 58, 62, 68, 70],
    probability: "high",
    lastAction: "Sep 12, 2024"
  },
  {
    id: "5",
    name: "Lily Hernandez",
    email: "lily.h@startup.io",
    source: "ORGANIC", 
    sourceType: "organic",
    status: "lost",
    size: 110000,
    interest: [60, 58, 55, 50, 45, 42, 38, 35, 30, 28],
    probability: "low",
    lastAction: "Sep 12, 2024"
  },
  {
    id: "6",
    name: "Christopher Wilson",
    email: "c.wilson@bigcorp.com",
    source: "SB2024",
    sourceType: "campaign", 
    status: "closed",
    size: 2120000,
    interest: [40, 42, 45, 48, 50, 52, 55, 58, 60, 62],
    probability: "mid",
    lastAction: "Sep 12, 2024"
  },
  {
    id: "7",
    name: "Isabella Lopez",
    email: "isabella@consulting.com",
    source: "ORGANIC",
    sourceType: "organic",
    status: "closing", 
    size: 20000,
    interest: [35, 38, 42, 46, 50, 55, 60, 65, 68, 72],
    probability: "high",
    lastAction: "Sep 12, 2024"
  },
  {
    id: "8",
    name: "Sophia Morgan",
    email: "sophia.morgan@agency.co",
    source: "AFF20",
    sourceType: "campaign",
    status: "new",
    size: 95000,
    interest: [55, 52, 48, 45, 40, 38, 35, 32, 30, 28],
    probability: "low",
    lastAction: "Sep 11, 2024"
  },
  {
    id: "9", 
    name: "John Davis",
    email: "john.davis@tech.com",
    source: "ORGANIC",
    sourceType: "organic",
    status: "pre-sale",
    size: 200000,
    interest: [30, 35, 40, 45, 50, 55, 60, 58, 62, 65],
    probability: "mid", 
    lastAction: "Sep 11, 2024"
  }
];

export default function LeadsTableDemo() {
  const [leads, setLeads] = useState<Lead[]>(initialLeads);

  const handleLeadAction = (leadId: string, action: string) => {
    console.log(`Lead ${leadId} action:`, action);
    // Simulate updating the lead's last action to today's date
    const today = new Date();
    const formattedDate = today.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
    setLeads(prev => prev.map(lead => 
      lead.id === leadId ? { ...lead, lastAction: formattedDate } : lead
    ));
  };

  // Simulate interest fluctuations for demo
  useEffect(() => {
    const interval = setInterval(() => {
      setLeads(prev => prev.map(lead => {
        // Only update non-closed leads for realism
        if (lead.status === "closed" || lead.status === "lost") {
          return lead;
        }

        // Generate new interest data point
        const currentTrend = lead.interest[lead.interest.length - 1] - lead.interest[lead.interest.length - 2];
        const momentum = Math.random() > 0.3 ? currentTrend * 0.7 : -currentTrend * 0.5; // 70% chance to continue trend
        const variation = (Math.random() - 0.5) * 8; // Random noise
        const lastValue = lead.interest[lead.interest.length - 1];
        const newValue = Math.max(20, Math.min(80, lastValue + momentum + variation));
        
        const newInterest = [...lead.interest.slice(1), Math.round(newValue)];
        
        return { ...lead, interest: newInterest };
      }));
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  return (
    <SimpleComponentDemoPage
      item={item}
      description="A leads management table with live interest sparklines, probability signals, selected-row actions, and simulated data movement."
      previewScaleClassName="w-[1200px] scale-[0.62]"
      previewInnerClassName="bg-[#f7f5ef] dark:bg-[#111]"
    >
      <LeadsTable leads={leads} onLeadAction={handleLeadAction} />
    </SimpleComponentDemoPage>
  );
}
