"use client";

import { useState, useEffect } from "react";
import { usePreviewMode, usePreviewSearchParam } from "@/components/bjork-ui/use-preview-mode";
import { Activity, BarChart3, Table2 } from "lucide-react";
import { ComponentDemoShell } from "@/components/bjork-ui/component-demo-shell";
import { FinancialTable, type MarketIndex } from "@/components/bjork-ui/tables/financial-table";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("financial-table");

const initialIndices: MarketIndex[] = [
  {
    id: "1",
    name: "Dow Jones USA",
    country: "USA",
    countryCode: "US",
    ytdReturn: 0.40,
    pltmEps: 18.74,
    divYield: 2.00,
    marketCap: 28.04,
    volume: 1.7,
    chartData: [330.5, 331.2, 330.8, 331.5, 332.1, 331.8, 332.4, 333.2, 333.9, 333.7],
    price: 333.90,
    dailyChange: -0.20,
    dailyChangePercent: -0.06
  },
  {
    id: "2",
    name: "S&P 500 USA",
    country: "USA",
    countryCode: "US",
    ytdReturn: 11.72,
    pltmEps: 7.42,
    divYield: 1.44,
    marketCap: 399.6,
    volume: 24.6,
    chartData: [425.1, 426.3, 427.8, 428.1, 429.2, 428.9, 429.5, 429.1, 428.7, 428.9],
    price: 428.72,
    dailyChange: -0.82,
    dailyChangePercent: -0.19
  },
  {
    id: "3",
    name: "Nasdaq USA",
    country: "USA",
    countryCode: "US",
    ytdReturn: 36.59,
    pltmEps: null,
    divYield: 0.54,
    marketCap: 199.9,
    volume: 18.9,
    chartData: [360.2, 361.8, 362.4, 363.1, 364.3, 363.8, 364.1, 363.5, 363.2, 362.97],
    price: 362.97,
    dailyChange: -1.73,
    dailyChangePercent: -0.47
  },
  {
    id: "4",
    name: "TSX Canada",
    country: "Canada",
    countryCode: "CA",
    ytdReturn: -0.78,
    pltmEps: 6.06,
    divYield: 2.56,
    marketCap: 3.67,
    volume: 771.5,
    chartData: [32.1, 32.3, 32.5, 32.4, 32.7, 32.8, 32.9, 33.0, 32.9, 32.96],
    price: 32.96,
    dailyChange: 0.19,
    dailyChangePercent: 0.58
  },
  {
    id: "5",
    name: "Grupo BMV Mexico",
    country: "Mexico",
    countryCode: "MX",
    ytdReturn: 4.15,
    pltmEps: 8.19,
    divYield: 2.34,
    marketCap: 1.22,
    volume: 1.1,
    chartData: [52.1, 52.8, 53.2, 53.5, 53.9, 54.1, 54.3, 54.0, 53.8, 53.7],
    price: 53.70,
    dailyChange: -1.01,
    dailyChangePercent: -1.85
  },
  {
    id: "6",
    name: "Ibovespa Brazil",
    country: "Brazil",
    countryCode: "BR",
    ytdReturn: 11.19,
    pltmEps: 6.23,
    divYield: 9.46,
    marketCap: 4.87,
    volume: 6.8,
    chartData: [28.5, 28.8, 29.1, 29.3, 29.5, 29.4, 29.6, 29.5, 29.3, 29.28],
    price: 29.28,
    dailyChange: -0.06,
    dailyChangePercent: -0.22
  }
];

export default function FinancialTableDemo() {
  const isPreview = usePreviewMode();
    const previewTheme = usePreviewSearchParam("theme");
  const tableTheme = previewTheme === "light" || previewTheme === "dark" ? previewTheme : "auto";
  const isPreviewLight = previewTheme === "light";
  const [indices, setIndices] = useState<MarketIndex[]>(initialIndices);

  const handleIndexSelect = (indexId: string) => {
    console.log(`Selected market index:`, indexId);
  };

  // Simulate live data updates for sparklines every 3 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setIndices(prev => prev.map(index => {
        // Generate new price point with slight random variation
        const lastPrice = index.chartData[index.chartData.length - 1];
        const variation = (Math.random() - 0.5) * 2; // ±1 point variation
        const newPrice = Math.max(1, lastPrice + variation);
        
        // Update chart data (shift array and add new point)
        const newChartData = [...index.chartData.slice(1), newPrice];
        
        // Update current price and daily change
        const priceChange = newPrice - lastPrice;
        const priceChangePercent = (priceChange / lastPrice) * 100;
        
        return {
          ...index,
          chartData: newChartData,
          price: newPrice,
          dailyChange: priceChange,
          dailyChangePercent: priceChangePercent
        };
      }));
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  const demo = (
    <div className="flex h-full w-full items-center justify-center overflow-hidden p-6">
      <div className="hide-scrollbar w-full max-w-[1040px] overflow-x-auto overflow-y-hidden">
        <FinancialTable
          title="Index"
          indices={indices}
          onIndexSelect={handleIndexSelect}
          theme={tableTheme}
          enableAnimations={!isPreview}
        />
      </div>
    </div>
  );

  if (isPreview) {
    return (
      <div
        style={{ colorScheme: isPreviewLight ? "light" : "dark" }}
        className={
          isPreviewLight
            ? "flex min-h-screen items-center justify-center overflow-hidden bg-[#f7f5ef] text-[#171717]"
            : "flex min-h-screen items-center justify-center overflow-hidden bg-[#111] text-[#ededed]"
        }
      >
        <div className="w-[1040px] scale-[0.58]">{demo}</div>
      </div>
    );
  }

  if (!item) return null;

  return (
    <ComponentDemoShell
      item={item}
      previewInnerClassName="p-0"
      description="A market-index table with country flags, YTD performance, sparklines, daily movement, and selected-row state. It is structured for dense financial dashboards where row scanning matters."
      dependencies={["framer-motion", "next-themes", "clsx"]}
      interactionRows={[
        {
          icon: <Table2 className="size-5" />,
          label: "Dense rows",
          value: "Each row combines market metadata, pricing, volume, and performance signals.",
        },
        {
          icon: <BarChart3 className="size-5" />,
          label: "Inline sparklines",
          value: "SVG paths render compact trend lines without a charting dependency.",
        },
        {
          icon: <Activity className="size-5" />,
          label: "Live simulation",
          value: "The demo updates chart data every few seconds to test motion and row stability.",
        },
      ]}
      cliCommand="npx shadcn add @bjork-ui/financial-table"
      usageCode={`import { FinancialTable } from "@/components/bjork-ui/tables/financial-table";

export function Demo() {
  return <FinancialTable title="Index" indices={indices} />;
}`}
    >
      {demo}
    </ComponentDemoShell>
  );
}
