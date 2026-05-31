"use client";

import { useState } from "react";
import { Bell, ChevronDown, MoreHorizontal, Settings2 } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import {
  BjorkAccordion,
  BjorkAccordionContent,
  BjorkAccordionItem,
  BjorkAccordionTrigger,
  BjorkAlert,
  BjorkAlertDescription,
  BjorkAlertTitle,
  BjorkBreadcrumb,
  BjorkBreadcrumbItem,
  BjorkBreadcrumbLink,
  BjorkBreadcrumbList,
  BjorkBreadcrumbPage,
  BjorkBreadcrumbSeparator,
  BjorkButton,
  BjorkButtonGroup,
  BjorkCalendar,
  BjorkCheckbox,
  BjorkCollapsible,
  BjorkCollapsibleContent,
  BjorkCollapsibleTrigger,
  BjorkCombobox,
  BjorkCommandPaletteDemo,
  BjorkDataTable,
  BjorkDatePicker,
  BjorkDialog,
  BjorkDialogContent,
  BjorkDialogDescription,
  BjorkDialogFooter,
  BjorkDialogHeader,
  BjorkDialogTitle,
  BjorkDialogTrigger,
  BjorkDropdownMenu,
  BjorkDropdownMenuContent,
  BjorkDropdownMenuItem,
  BjorkDropdownMenuLabel,
  BjorkDropdownMenuSeparator,
  BjorkDropdownMenuTrigger,
  BjorkFormPreview,
  BjorkInputMask,
  BjorkInputOTP,
  BjorkPagination,
  BjorkPopover,
  BjorkPopoverContent,
  BjorkPopoverTrigger,
  BjorkRadioGroup,
  BjorkSelect,
  BjorkShaderAvatar,
  BjorkSheet,
  BjorkSheetContent,
  BjorkSheetDescription,
  BjorkSheetFooter,
  BjorkSheetHeader,
  BjorkSheetTitle,
  BjorkSheetTrigger,
  BjorkSlider,
  BjorkSonnerDemo,
  BjorkSwitch,
  BjorkTable,
  BjorkTabs,
  BjorkTextarea,
  BjorkTooltip,
  BjorkTooltipContent,
  BjorkTooltipTrigger,
} from "@/components/bjork-ui/primitives";
import type { GalleryItem } from "@/lib/bjork-gallery";
import {
  PrimitiveDocsSection,
  PrimitivePreviewExamples,
  PrimitivePropTable,
  type PrimitivePreviewExample,
} from "./primitive-docs";
import { getPrimitiveMeta } from "./primitive-meta";

interface PrimitiveDemo {
  title: string;
  description: string;
  usageCode: string;
  examples: readonly PrimitivePreviewExample[];
}

const primitiveDemos: Record<string, PrimitiveDemo> = {
  accordion: {
    title: "Accordion",
    description: "A single card disclosure primitive with compact internal rows and a quick blur reveal for opened content.",
    usageCode: `import { BjorkAccordion, BjorkAccordionItem, BjorkAccordionTrigger, BjorkAccordionContent } from "@/components/bjork-ui/primitives";`,
    examples: [
      {
        label: "Disclosure stack",
        description: "Use for grouped content that should stay inside one continuous surface.",
        preview: (
          <BjorkAccordion type="single" collapsible defaultValue="surface">
            <BjorkAccordionItem value="surface">
              <BjorkAccordionTrigger>Surface rules</BjorkAccordionTrigger>
              <BjorkAccordionContent>
                Keep the content inside a single compact surface with no nested cards.
              </BjorkAccordionContent>
            </BjorkAccordionItem>
            <BjorkAccordionItem value="motion">
              <BjorkAccordionTrigger>Motion rules</BjorkAccordionTrigger>
              <BjorkAccordionContent>
                Use transform and opacity so opening stays light and interruptible.
              </BjorkAccordionContent>
            </BjorkAccordionItem>
            <BjorkAccordionItem value="density">
              <BjorkAccordionTrigger>Density rules</BjorkAccordionTrigger>
              <BjorkAccordionContent>
                Keep the rows tight enough for docs, but leave the outer radius visible.
              </BjorkAccordionContent>
            </BjorkAccordionItem>
            <BjorkAccordionItem value="states">
              <BjorkAccordionTrigger>State rules</BjorkAccordionTrigger>
              <BjorkAccordionContent>
                Open, hover, and focus states should stay quiet unless the content needs action.
              </BjorkAccordionContent>
            </BjorkAccordionItem>
          </BjorkAccordion>
        ),
        code: `<BjorkAccordion type="single" collapsible>
  <BjorkAccordionItem value="surface">
    <BjorkAccordionTrigger>Surface rules</BjorkAccordionTrigger>
    <BjorkAccordionContent>Keep content inside one continuous card.</BjorkAccordionContent>
  </BjorkAccordionItem>
  <BjorkAccordionItem value="motion">
    <BjorkAccordionTrigger>Motion rules</BjorkAccordionTrigger>
    <BjorkAccordionContent>Opened content uses a quick blur reveal.</BjorkAccordionContent>
  </BjorkAccordionItem>
</BjorkAccordion>`,
      },
    ],
  },
  alerts: {
    title: "Alerts",
    description: "A status callout for important system feedback without leaving the Bjork surface language.",
    usageCode: `import { BjorkAlert, BjorkAlertTitle, BjorkAlertDescription } from "@/components/bjork-ui/primitives";`,
    examples: [
      {
        label: "System alert",
        description: "Use when a surface needs a short title, icon, and one supporting sentence.",
        preview: (
          <BjorkAlert>
            <div className="flex items-center gap-2 text-[color:var(--bjork-text-strong)]">
              <Bell className="size-4" aria-hidden="true" />
              <BjorkAlertTitle>Usage spike detected</BjorkAlertTitle>
            </div>
            <BjorkAlertDescription>
              The weekly report is ready and includes three high-priority accounts.
            </BjorkAlertDescription>
          </BjorkAlert>
        ),
        code: `<BjorkAlert>
  <div className="flex items-center gap-2">
    <Bell aria-hidden="true" />
    <BjorkAlertTitle>Usage spike detected</BjorkAlertTitle>
  </div>
  <BjorkAlertDescription>Report is ready.</BjorkAlertDescription>
</BjorkAlert>`,
      },
    ],
  },
  avatar: {
    title: "Avatar",
    description: "A WebGL shader avatar for premium identity surfaces and realtime profile states.",
    usageCode: `import { BjorkShaderAvatar } from "@/components/bjork-ui/primitives";`,
    examples: [
      {
        label: "Shader avatar",
        description: "Use for profile anchors where a live, abstract identity mark feels better than a flat fallback.",
        preview: (
          <div className="flex items-center gap-4">
            <BjorkShaderAvatar initials="Z" size={86} />
            <BjorkShaderAvatar initials="IB" size={64} />
          </div>
        ),
        code: `<BjorkShaderAvatar initials="Z" size={86} />`,
      },
    ],
  },
  breadcrumb: {
    title: "Breadcrumb",
    description: "A quiet path primitive for nested docs and component pages.",
    usageCode: `import { BjorkBreadcrumb } from "@/components/bjork-ui/primitives";`,
    examples: [
      {
        label: "Page path",
        description: "Use above the preview shell or dense detail pages to show location without adding a second nav.",
        preview: (
          <BjorkBreadcrumb>
            <BjorkBreadcrumbList className="text-[color:var(--bjork-text-soft)]">
              <BjorkBreadcrumbItem>
                <BjorkBreadcrumbLink href="#">Components</BjorkBreadcrumbLink>
              </BjorkBreadcrumbItem>
              <BjorkBreadcrumbSeparator />
              <BjorkBreadcrumbItem>
                <BjorkBreadcrumbPage className="text-[color:var(--bjork-text-strong)]">Avatar</BjorkBreadcrumbPage>
              </BjorkBreadcrumbItem>
            </BjorkBreadcrumbList>
          </BjorkBreadcrumb>
        ),
        code: `<BjorkBreadcrumb>
  <BjorkBreadcrumbList>
    <BjorkBreadcrumbItem>
      <BjorkBreadcrumbLink href="#">Components</BjorkBreadcrumbLink>
    </BjorkBreadcrumbItem>
    <BjorkBreadcrumbSeparator />
    <BjorkBreadcrumbItem>
      <BjorkBreadcrumbPage>Avatar</BjorkBreadcrumbPage>
    </BjorkBreadcrumbItem>
  </BjorkBreadcrumbList>
</BjorkBreadcrumb>`,
      },
    ],
  },
  "button-group": {
    title: "Button Group",
    description: "A compact grouped control shell for related actions.",
    usageCode: `import { BjorkButtonGroup, BjorkButton } from "@/components/bjork-ui/primitives";`,
    examples: [
      {
        label: "Segmented actions",
        description: "Use for related controls that need one shared border and independent button motion.",
        preview: (
          <BjorkButtonGroup>
            <BjorkButton variant="ghost" size="sm">Day</BjorkButton>
            <BjorkButton variant="secondary" size="sm">Week</BjorkButton>
            <BjorkButton variant="ghost" size="sm">Month</BjorkButton>
          </BjorkButtonGroup>
        ),
        code: `<BjorkButtonGroup>
  <BjorkButton variant="ghost" size="sm">Day</BjorkButton>
  <BjorkButton variant="secondary" size="sm">Week</BjorkButton>
</BjorkButtonGroup>`,
      },
    ],
  },
  calendar: {
    title: "Calendar",
    description: "A DayPicker skin for scheduling and date selection with outline and base card surfaces.",
    usageCode: `import { BjorkCalendar } from "@/components/bjork-ui/primitives";`,
    examples: [
      {
        label: "Base card",
        description: "Use when the calendar should sit as the main raised surface in the layout.",
        preview: <BjorkCalendar mode="single" selected={new Date(2026, 4, 15)} />,
        staticScaleClassName: "scale-[1.28]",
        code: `<BjorkCalendar mode="single" selected={new Date(2026, 4, 15)} />`,
      },
      {
        label: "Outline",
        description: "Use in popovers, sheets, and secondary scheduling surfaces.",
        preview: <BjorkCalendar variant="outline" mode="single" selected={new Date(2026, 4, 15)} />,
        code: `<BjorkCalendar variant="outline" mode="single" selected={new Date(2026, 4, 15)} />`,
      },
    ],
  },
  checkbox: {
    title: "Checkbox",
    description: "A compact binary control with the orange checked state.",
    usageCode: `import { BjorkCheckbox } from "@/components/bjork-ui/primitives";`,
    examples: [
      {
        label: "Checked row",
        description: "Use inside tables, preference rows, or dense filter stacks.",
        preview: (
          <label className="flex items-center gap-3 text-sm text-[color:var(--bjork-text-medium)]">
            <BjorkCheckbox defaultChecked />
            Include archived items
          </label>
        ),
        code: `<label>
  <BjorkCheckbox defaultChecked />
  Include archived items
</label>`,
      },
    ],
  },
  collapsible: {
    title: "Collapsible",
    description: "A single disclosure primitive for revealing extra content without changing page structure.",
    usageCode: `import { BjorkCollapsible, BjorkCollapsibleTrigger, BjorkCollapsibleContent } from "@/components/bjork-ui/primitives";`,
    examples: [
      {
        label: "Inline reveal",
        description: "Use for detail rows and optional settings that should remain in the same visual block.",
        preview: (
          <CollapsiblePreview />
        ),
        code: `<BjorkCollapsible>
  <BjorkCollapsibleTrigger asChild>
    <BjorkButton>Advanced settings</BjorkButton>
  </BjorkCollapsibleTrigger>
  <BjorkCollapsibleContent>Details</BjorkCollapsibleContent>
</BjorkCollapsible>`,
      },
    ],
  },
  combobox: {
    title: "Combobox",
    description: "A searchable popover select for command-heavy product surfaces.",
    usageCode: `import { BjorkCombobox } from "@/components/bjork-ui/primitives";`,
    examples: [{ label: "Metric picker", description: "Use when options need filtering before selection.", preview: <BjorkCombobox />, code: `<BjorkCombobox />` }],
  },
  "command-palette": {
    title: "Command Palette",
    description: "A Command-K search dialog for page routing, primitive discovery, component search, and app actions.",
    usageCode: `import { BjorkCommandPalette } from "@/components/bjork-ui/primitives";`,
    examples: [
      {
        label: "Global search",
        description: "Use for app-level navigation and command-heavy product surfaces.",
        preview: <BjorkCommandPaletteDemo />,
        code: `<BjorkCommandPalette />`,
      },
    ],
  },
  "data-table": {
    title: "Data Table",
    description: "A table plus filter control pattern for operational pages.",
    usageCode: `import { BjorkDataTable } from "@/components/bjork-ui/primitives";`,
    examples: [{ label: "Filterable accounts", description: "Use when table scanning and filtering belong to one compact block.", preview: <BjorkDataTable />, code: `<BjorkDataTable />` }],
  },
  "date-picker": {
    title: "Date Picker",
    description: "A button-triggered calendar popover with the Bjork calendar skin.",
    usageCode: `import { BjorkDatePicker } from "@/components/bjork-ui/primitives";`,
    examples: [{ label: "Date popover", description: "Use where a single date selection should stay anchored to a control.", preview: <BjorkDatePicker />, code: `<BjorkDatePicker />` }],
  },
  dialog: {
    title: "Dialog",
    description: "A centered modal for focused decisions.",
    usageCode: `import { BjorkDialog, BjorkDialogTrigger, BjorkDialogContent } from "@/components/bjork-ui/primitives";`,
    examples: [
      {
        label: "Confirmation dialog",
        description: "Use for focused confirmation flows with primary and secondary actions.",
        preview: (
          <BjorkDialog>
            <BjorkDialogTrigger asChild><BjorkButton>Open dialog</BjorkButton></BjorkDialogTrigger>
            <BjorkDialogContent>
              <BjorkDialogHeader>
                <BjorkDialogTitle>Publish component?</BjorkDialogTitle>
                <BjorkDialogDescription>Push this primitive into the visible component index.</BjorkDialogDescription>
              </BjorkDialogHeader>
              <BjorkDialogFooter><BjorkButton variant="accent">Publish</BjorkButton></BjorkDialogFooter>
            </BjorkDialogContent>
          </BjorkDialog>
        ),
        code: `<BjorkDialog>
  <BjorkDialogTrigger asChild><BjorkButton>Open</BjorkButton></BjorkDialogTrigger>
  <BjorkDialogContent>...</BjorkDialogContent>
</BjorkDialog>`,
      },
    ],
  },
  "dropdown-menu": {
    title: "Dropdown Menu",
    description: "A compact menu surface for contextual actions.",
    usageCode: `import { BjorkDropdownMenu } from "@/components/bjork-ui/primitives";`,
    examples: [
      {
        label: "Action menu",
        description: "Use for secondary row or toolbar actions.",
        preview: (
          <BjorkDropdownMenu>
            <BjorkDropdownMenuTrigger asChild><BjorkButton size="icon" aria-label="Menu"><MoreHorizontal /></BjorkButton></BjorkDropdownMenuTrigger>
            <BjorkDropdownMenuContent>
              <BjorkDropdownMenuLabel>Actions</BjorkDropdownMenuLabel>
              <BjorkDropdownMenuItem>Duplicate</BjorkDropdownMenuItem>
              <BjorkDropdownMenuItem>Archive</BjorkDropdownMenuItem>
              <BjorkDropdownMenuSeparator />
              <BjorkDropdownMenuItem>Delete</BjorkDropdownMenuItem>
            </BjorkDropdownMenuContent>
          </BjorkDropdownMenu>
        ),
        code: `<BjorkDropdownMenu>
  <BjorkDropdownMenuTrigger asChild><BjorkButton>Open</BjorkButton></BjorkDropdownMenuTrigger>
  <BjorkDropdownMenuContent>...</BjorkDropdownMenuContent>
</BjorkDropdownMenu>`,
      },
    ],
  },
  form: {
    title: "Form",
    description: "A compact form block with label, helper text, input, and final action.",
    usageCode: `import { BjorkFormPreview } from "@/components/bjork-ui/primitives";`,
    examples: [{ label: "Profile form", description: "Use as the base rhythm for settings and account forms.", preview: <BjorkFormPreview />, code: `<BjorkFormPreview />` }],
  },
  "input-mask": {
    title: "Input Mask",
    description: "An input primitive with formatted numeric entry.",
    usageCode: `import { BjorkInputMask } from "@/components/bjork-ui/primitives";`,
    examples: [{ label: "Card mask", description: "Use for structured numeric input where spacing improves scanning.", preview: <BjorkInputMask />, code: `<BjorkInputMask />` }],
  },
  "input-otp": {
    title: "Input OTP",
    description: "A six-slot verification code control with the same surface variants as Bjork inputs.",
    usageCode: `import { BjorkInputOTP } from "@/components/bjork-ui/primitives";`,
    examples: [
      {
        label: "Default OTP",
        description: "Use for the standard raised Bjork field surface.",
        preview: <BjorkInputOTP variant="default" />,
        code: `<BjorkInputOTP variant="default" />`,
      },
      {
        label: "Inset OTP",
        description: "Use where the slots should feel recessed into the surrounding surface.",
        preview: <BjorkInputOTP variant="inset" />,
        code: `<BjorkInputOTP variant="inset" />`,
      },
      {
        label: "Ghost OTP",
        description: "Use only when the layout already provides enough framing.",
        preview: <BjorkInputOTP variant="ghost" />,
        code: `<BjorkInputOTP variant="ghost" />`,
      },
    ],
  },
  pagination: {
    title: "Pagination",
    description: "A grouped pagination control for tables and long result sets.",
    usageCode: `import { BjorkPagination } from "@/components/bjork-ui/primitives";`,
    examples: [{ label: "Paged controls", description: "Use below dense lists when scrolling alone is not enough.", preview: <BjorkPagination />, code: `<BjorkPagination />` }],
  },
  popover: {
    title: "Popover",
    description: "A small anchored overlay for compact contextual content.",
    usageCode: `import { BjorkPopover, BjorkPopoverTrigger, BjorkPopoverContent } from "@/components/bjork-ui/primitives";`,
    examples: [
      {
        label: "Info popover",
        description: "Use for supporting details that should not become a modal.",
        preview: (
          <BjorkPopover>
            <BjorkPopoverTrigger asChild><BjorkButton>Open popover</BjorkButton></BjorkPopoverTrigger>
            <BjorkPopoverContent className="w-64 text-sm leading-6 text-[color:var(--bjork-text-muted)]">Keep supporting details near the control that opened them.</BjorkPopoverContent>
          </BjorkPopover>
        ),
        code: `<BjorkPopover>
  <BjorkPopoverTrigger asChild><BjorkButton>Open</BjorkButton></BjorkPopoverTrigger>
  <BjorkPopoverContent>Details</BjorkPopoverContent>
</BjorkPopover>`,
      },
    ],
  },
  "radio-group": {
    title: "Radio Group",
    description: "A single-choice group with framed rows.",
    usageCode: `import { BjorkRadioGroup } from "@/components/bjork-ui/primitives";`,
    examples: [{ label: "Plan picker", description: "Use for mutually exclusive choices that need labels and icons.", preview: <BjorkRadioGroup />, code: `<BjorkRadioGroup />` }],
  },
  select: {
    title: "Select",
    description: "A compact option picker skinned with the same surface variants as Bjork inputs.",
    usageCode: `import { BjorkSelect } from "@/components/bjork-ui/primitives";`,
    examples: [
      {
        label: "Default select",
        description: "Use for the standard raised Bjork field surface.",
        preview: <BjorkSelect variant="default" defaultValue="weekly" />,
        code: `<BjorkSelect variant="default" />`,
      },
      {
        label: "Inset select",
        description: "Use inside framed regions where the trigger should read as recessed.",
        preview: <BjorkSelect variant="inset" defaultValue="monthly" />,
        code: `<BjorkSelect variant="inset" />`,
      },
      {
        label: "Ghost select",
        description: "Use where the control needs to stay quiet until hover or focus.",
        preview: <BjorkSelect variant="ghost" defaultValue="monthly" />,
        code: `<BjorkSelect variant="ghost" />`,
      },
    ],
  },
  sheet: {
    title: "Sheet",
    description: "A side panel for secondary workflows.",
    usageCode: `import { BjorkSheet, BjorkSheetTrigger, BjorkSheetContent } from "@/components/bjork-ui/primitives";`,
    examples: [
      {
        label: "Side sheet",
        description: "Use when the user needs more room without leaving the current page.",
        preview: (
          <BjorkSheet>
            <BjorkSheetTrigger asChild><BjorkButton>Open sheet</BjorkButton></BjorkSheetTrigger>
            <BjorkSheetContent>
              <BjorkSheetHeader>
                <BjorkSheetTitle>Component settings</BjorkSheetTitle>
                <BjorkSheetDescription>Adjust the primitive before publishing.</BjorkSheetDescription>
              </BjorkSheetHeader>
              <BjorkSheetFooter><BjorkButton variant="accent">Save</BjorkButton></BjorkSheetFooter>
            </BjorkSheetContent>
          </BjorkSheet>
        ),
        code: `<BjorkSheet>
  <BjorkSheetTrigger asChild><BjorkButton>Open</BjorkButton></BjorkSheetTrigger>
  <BjorkSheetContent>...</BjorkSheetContent>
</BjorkSheet>`,
      },
    ],
  },
  sonner: {
    title: "Sonner",
    description: "A toast trigger and themed Toaster skin.",
    usageCode: `import { BjorkSonnerDemo } from "@/components/bjork-ui/primitives";`,
    examples: [{ label: "Toast action", description: "Use for short async confirmation without blocking the interface.", preview: <BjorkSonnerDemo />, code: `<BjorkSonnerDemo />` }],
  },
  slider: {
    title: "Slider",
    description: "The custom range control from the option selector, extracted into a reusable Bjork primitive.",
    usageCode: `import { BjorkSlider } from "@/components/bjork-ui/primitives";`,
    examples: [
      {
        label: "Option strength",
        description: "Use for compact numeric tuning where the orange fill and pill thumb should match the demo controls.",
        preview: <SliderPreview />,
        previewClassName: "items-center",
        code: `<BjorkSlider
  aria-label="Option strength"
  min={0}
  max={100}
  value={value}
  displayValue={\`\${value}%\`}
  onValueChange={setValue}
/>`,
      },
      {
        label: "Bare slider",
        description: "Use without the value rail when the surrounding UI already shows the current value.",
        preview: (
          <div className="w-full max-w-[340px]">
            <BjorkSlider aria-label="Playback position" defaultValue={38} />
          </div>
        ),
        previewClassName: "items-center",
        code: `<BjorkSlider
  aria-label="Playback position"
  defaultValue={38}
/>`,
      },
      {
        label: "Disabled slider",
        description: "Use disabled to preserve the measured control footprint while making the setting unavailable.",
        preview: (
          <div className="w-full max-w-[340px]">
            <BjorkSlider aria-label="Locked intensity" value={72} displayValue="72%" disabled />
          </div>
        ),
        previewClassName: "items-center",
        code: `<BjorkSlider
  aria-label="Locked intensity"
  value={72}
  displayValue="72%"
  disabled
/>`,
      },
    ],
  },
  switch: {
    title: "Switch",
    description: "A binary toggle restyled with the same slim orange rail and gray pill thumb as the Bjork slider.",
    usageCode: `import { BjorkSwitch } from "@/components/bjork-ui/primitives";`,
    examples: [
      {
        label: "Slider-style toggle",
        description: "Use for persistent on/off preferences when the switch should stay as clean as the range control.",
        preview: (
          <div className="flex items-center gap-5">
            <BjorkSwitch aria-label="Enable small preview" size="sm" defaultChecked />
            <BjorkSwitch aria-label="Enable medium preview" defaultChecked />
            <BjorkSwitch aria-label="Enable large preview" size="lg" defaultChecked />
          </div>
        ),
        previewClassName: "items-center",
        code: `<BjorkSwitch
  aria-label="Enable preview"
  size="lg"
  defaultChecked
/>`,
      },
    ],
  },
  table: {
    title: "Table",
    description: "A restrained table shell for dense account and metrics data.",
    usageCode: `import { BjorkTable } from "@/components/bjork-ui/primitives";`,
    examples: [{ label: "Account table", description: "Use when the table itself is the primitive, without filter chrome.", preview: <BjorkTable />, code: `<BjorkTable />` }],
  },
  tabs: {
    title: "Tabs",
    description: "A segmented content switcher with a stable panel footprint.",
    usageCode: `import { BjorkTabs } from "@/components/bjork-ui/primitives";`,
    examples: [{ label: "Panel tabs", description: "Use when parallel sections should occupy the same visual position.", preview: <BjorkTabs />, code: `<BjorkTabs />` }],
  },
  textarea: {
    title: "Textarea",
    description: "A larger text-entry surface matching the Bjork input language.",
    usageCode: `import { BjorkTextarea } from "@/components/bjork-ui/primitives";`,
    examples: [
      {
        label: "Base textarea",
        description: "Use for longer text entry with the standard raised Bjork field surface.",
        preview: <BjorkTextarea variant="base" placeholder="Write a component note..." />,
        code: `<BjorkTextarea
  variant="base"
  placeholder="Write a component note..."
/>`,
      },
      {
        label: "Outline textarea",
        description: "Use when the field needs a clearer edge and the inset field shadow.",
        preview: (
          <BjorkTextarea
            variant="outline"
            defaultValue="The component is ready for the next review pass."
            className="min-h-[140px]"
          />
        ),
        code: `<BjorkTextarea
  variant="outline"
  defaultValue="The component is ready for review."
  className="min-h-[140px]"
/>`,
      },
      {
        label: "Quiet textarea",
        description: "Use for lower-emphasis notes inside denser settings surfaces.",
        preview: <BjorkTextarea variant="quiet" defaultValue="Lower emphasis, same Bjork field language." />,
        code: `<BjorkTextarea
  variant="quiet"
  defaultValue="Lower emphasis, same Bjork field language."
/>`,
      },
    ],
  },
  tooltip: {
    title: "Tooltip",
    description: "A compact hover/focus hint for icon-only controls.",
    usageCode: `import { BjorkTooltip, BjorkTooltipTrigger, BjorkTooltipContent } from "@/components/bjork-ui/primitives";`,
    examples: [
      {
        label: "Icon hint",
        description: "Use for controls where the icon is clear but still needs an accessible label.",
        preview: (
          <BjorkTooltip>
            <BjorkTooltipTrigger asChild><BjorkButton size="icon" variant="secondary" aria-label="Settings"><Settings2 /></BjorkButton></BjorkTooltipTrigger>
            <BjorkTooltipContent>Component settings</BjorkTooltipContent>
          </BjorkTooltip>
        ),
        code: `<BjorkTooltip>
  <BjorkTooltipTrigger asChild><BjorkButton>...</BjorkButton></BjorkTooltipTrigger>
  <BjorkTooltipContent>Component settings</BjorkTooltipContent>
</BjorkTooltip>`,
      },
    ],
  },
};

function CollapsiblePreview() {
  const [open, setOpen] = useState(true);
  const shouldReduceMotion = useReducedMotion();

  return (
    <BjorkCollapsible
      open={open}
      onOpenChange={setOpen}
      className="w-[290px] rounded-[18px] bg-[var(--bjork-bg)] p-3"
    >
      <BjorkCollapsibleTrigger asChild>
        <motion.button
          type="button"
          whileHover={shouldReduceMotion ? undefined : { scale: 1.01 }}
          whileTap={shouldReduceMotion ? undefined : { scale: 0.992 }}
          transition={{ type: "spring", stiffness: 400, damping: 25 }}
          className="flex w-full items-center justify-between rounded-[14px] px-3 py-2.5 text-left text-sm font-medium text-[color:var(--bjork-text-muted)] outline-none transition-colors hover:text-[color:var(--bjork-text)] focus-visible:text-[color:var(--bjork-text)]"
        >
          <span>Advanced settings</span>
          <motion.span
            animate={{ rotate: open ? 180 : 0 }}
            transition={
              shouldReduceMotion
                ? { duration: 0.12 }
                : { type: "spring", stiffness: 420, damping: 28 }
            }
            className="text-[color:var(--bjork-text-soft)]"
          >
            <ChevronDown className="size-4" aria-hidden="true" />
          </motion.span>
        </motion.button>
      </BjorkCollapsibleTrigger>
      <BjorkCollapsibleContent className="px-3 pt-3 text-sm leading-6 text-[color:var(--bjork-text-muted)]">
        Sync interval, quiet mode, and retention windows are available.
      </BjorkCollapsibleContent>
    </BjorkCollapsible>
  );
}

function SliderPreview() {
  const [value, setValue] = useState(64);

  return (
    <div className="w-full max-w-[340px]">
      <BjorkSlider
        aria-label="Option strength"
        min={0}
        max={100}
        value={value}
        displayValue={`${value}%`}
        onValueChange={setValue}
      />
    </div>
  );
}

export function PrimitivePageClient({
  slug,
  item,
}: {
  slug: string;
  item: GalleryItem;
}) {
  const demo = primitiveDemos[slug];
  const meta = getPrimitiveMeta(slug);

  return (
    <SimpleComponentDemoPage
      item={item}
      description={meta?.description ?? demo.description}
      dependencies={meta ? [...meta.dependencies] : []}
      interactionRows={
        meta
          ? [
              {
                label: meta.interactionType,
                value: meta.interactionDescription,
              },
            ]
          : undefined
      }
      usageCode={demo.usageCode}
      details={<PrimitiveDocs title={demo.title} slug={slug} />}
      previewLayout="list"
    >
      <PrimitivePreviewExamples examples={demo.examples} />
    </SimpleComponentDemoPage>
  );
}

function PrimitiveDocs({ title, slug }: { title: string; slug: string }) {
  return (
    <PrimitiveDocsSection title="Props">
      <PrimitivePropTable
        rows={[
          {
            name: "className",
            value: "string",
            description: `Pass through styling hooks for the ${title} primitive without replacing the base Bjork surface.`,
          },
          {
            name: "children",
            value: "ReactNode",
            description: "Composable content, labels, icons, and nested content where the primitive supports them.",
          },
          getPrimitiveBehaviorPropRow(slug),
        ]}
      />
    </PrimitiveDocsSection>
  );
}

function getPrimitiveBehaviorPropRow(slug: string) {
  const rows: Record<string, { name: string; value: string; description: string }> = {
    accordion: {
      name: "type / value",
      value: "single | multiple",
      description: "Controls whether one or many sections can be open, with optional controlled or default open values.",
    },
    checkbox: {
      name: "checked",
      value: "boolean",
      description: "Use with onCheckedChange when the checked state is controlled by your form or table row.",
    },
    calendar: {
      name: "variant",
      value: '"outline" | "base"',
      description: "Choose the inset outline shell or the raised base-card surface while keeping the same date behavior.",
    },
    collapsible: {
      name: "open",
      value: "boolean",
      description: "Controls whether the attached content region is expanded or collapsed.",
    },
    combobox: {
      name: "options",
      value: "Option[]",
      description: "Provide the searchable option list and read the selected value from the change callback.",
    },
    "command-palette": {
      name: "open / items",
      value: "boolean / CommandPaletteItem[]",
      description: "Control dialog state externally, or provide custom pages, actions, and grouped command rows.",
    },
    "date-picker": {
      name: "date",
      value: "Date",
      description: "Provide a selected date and update it from the calendar selection callback.",
    },
    dialog: {
      name: "open",
      value: "boolean",
      description: "Use with onOpenChange when the modal needs to be controlled from page state.",
    },
    "dropdown-menu": {
      name: "items",
      value: "menu actions",
      description: "Render command rows, separators, and labels inside the menu content.",
    },
    input: {
      name: "value",
      value: "string",
      description: "Use normal input props for controlled form state, placeholders, disabled state, and validation attributes.",
    },
    "input-mask": {
      name: "value",
      value: "string",
      description: "Pass the raw value through the input while the component displays grouped formatting.",
    },
    "input-otp": {
      name: "variant",
      value: '"default" | "quiet" | "inset" | "ghost"',
      description: "Match the OTP slot surface to the same visual variants used by Bjork inputs.",
    },
    pagination: {
      name: "page",
      value: "number",
      description: "Track the active page and wire previous, next, or direct page changes to your data set.",
    },
    popover: {
      name: "open",
      value: "boolean",
      description: "Use with onOpenChange when the anchored content should be controlled externally.",
    },
    "radio-group": {
      name: "value",
      value: "string",
      description: "Stores the selected option and updates through onValueChange.",
    },
    select: {
      name: "variant",
      value: '"default" | "quiet" | "inset" | "ghost"',
      description: "Match the select trigger and dropdown surface to the same visual variants used by Bjork inputs.",
    },
    sheet: {
      name: "open",
      value: "boolean",
      description: "Use with onOpenChange when a side panel needs to be opened from page state.",
    },
    slider: {
      name: "value",
      value: "number",
      description: "Set the current range value along with min, max, step, and onValueChange.",
    },
    switch: {
      name: "checked",
      value: "boolean",
      description: "Use with onCheckedChange for controlled on-or-off settings.",
    },
    tabs: {
      name: "value",
      value: "string",
      description: "Stores the active tab and updates through onValueChange.",
    },
    textarea: {
      name: "variant",
      value: '"default" | "quiet" | "inset" | "ghost"',
      description: "Match the textarea surface to the same Bjork field variants used by inputs.",
    },
    tooltip: {
      name: "content",
      value: "ReactNode",
      description: "Provide the short helper text or custom content shown from hover and keyboard focus.",
    },
  };

  return rows[slug] ?? {
    name: "...props",
    value: "component props",
    description: "Pass through the normal props for this primitive while the Bjork wrapper handles the visual treatment.",
  };
}

export const primitiveDemoSlugs = Object.keys(primitiveDemos);
