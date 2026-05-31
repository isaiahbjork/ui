export const primitiveMeta = [
  {
    slug: "accordion",
    title: "Accordion",
    sourcePath: "components/bjork-ui/primitives/accordion.tsx",
    description:
      "A stacked disclosure control for expanding one section of supporting content without leaving the page.",
    interactionType: "Disclosure",
    interactionDescription:
      "The user opens or closes a section by activating its trigger with pointer or keyboard input.",
    dependencies: ["React", "@radix-ui/react-accordion", "lucide-react", "clsx", "tailwind-merge"],
  },
  {
    slug: "alerts",
    title: "Alerts",
    sourcePath: "components/bjork-ui/primitives/alerts.tsx",
    description:
      "A compact status callout for surfacing important feedback with a title and supporting message.",
    interactionType: "Status message",
    interactionDescription:
      "The component presents feedback passively and uses alert semantics when the message needs attention.",
    dependencies: ["React", "class-variance-authority", "clsx", "tailwind-merge"],
  },
  {
    slug: "avatar",
    title: "Avatar",
    sourcePath: "components/bjork-ui/primitives/avatar.tsx",
    description:
      "A live shader avatar for identity anchors that need motion without relying on user photos.",
    interactionType: "Identity display",
    interactionDescription:
      "The component renders a non-clickable animated profile mark that respects reduced-motion preferences.",
    dependencies: ["React", "framer-motion", "clsx", "tailwind-merge"],
  },
  {
    slug: "badge",
    title: "Badge",
    sourcePath: "components/bjork-ui/primitives/badge.tsx",
    description:
      "A compact status label for state, category, and metadata markers in dense interfaces.",
    interactionType: "Status label",
    interactionDescription:
      "The component communicates state without requiring user input.",
    dependencies: ["React", "framer-motion", "class-variance-authority", "clsx", "tailwind-merge"],
  },
  {
    slug: "breadcrumb",
    title: "Breadcrumb",
    sourcePath: "components/bjork-ui/primitives/breadcrumb.tsx",
    description:
      "A low-emphasis navigation trail for showing where the current page sits in a hierarchy.",
    interactionType: "Navigation trail",
    interactionDescription:
      "The user can follow breadcrumb links back through parent pages while the current page remains static text.",
    dependencies: ["React", "clsx", "tailwind-merge"],
  },
  {
    slug: "button",
    title: "Button",
    sourcePath: "components/bjork-ui/primitives/button.tsx",
    description:
      "A tactile action button with variants for primary, secondary, utility, and icon-only controls.",
    interactionType: "Action trigger",
    interactionDescription:
      "The user activates a command with pointer, keyboard, optional press motion, and optional haptic feedback.",
    dependencies: ["React", "framer-motion", "class-variance-authority", "web-haptics", "clsx", "tailwind-merge"],
  },
  {
    slug: "button-group",
    title: "Button Group",
    sourcePath: "components/bjork-ui/primitives/button-group.tsx",
    description:
      "A joined control group for related actions that should read as one toolbar.",
    interactionType: "Grouped actions",
    interactionDescription:
      "The user chooses from adjacent button actions while the wrapper preserves a shared control boundary.",
    dependencies: ["React", "clsx", "tailwind-merge"],
  },
  {
    slug: "calendar",
    title: "Calendar",
    sourcePath: "components/bjork-ui/primitives/calendar.tsx",
    description:
      "A single-month date selector for scheduling flows, filters, and date-picking popovers.",
    interactionType: "Date selection",
    interactionDescription:
      "The user navigates the month and selects a date from the calendar grid.",
    dependencies: ["React", "react-day-picker", "lucide-react", "clsx", "tailwind-merge"],
  },
  {
    slug: "card",
    title: "Card",
    sourcePath: "components/bjork-ui/primitives/card.tsx",
    description:
      "A composable content surface for grouping headers, metrics, media, and actions.",
    interactionType: "Content container",
    interactionDescription:
      "The component can stay static or use its interactive variant when the full card acts as a target.",
    dependencies: ["React", "framer-motion", "class-variance-authority", "clsx", "tailwind-merge"],
  },
  {
    slug: "checkbox",
    title: "Checkbox",
    sourcePath: "components/bjork-ui/primitives/checkbox.tsx",
    description:
      "A binary selection control for preferences, filters, and table rows.",
    interactionType: "Binary selection",
    interactionDescription:
      "The user toggles a checked, unchecked, or controlled state with pointer or keyboard input.",
    dependencies: ["React", "@radix-ui/react-checkbox", "lucide-react", "clsx", "tailwind-merge"],
  },
  {
    slug: "collapsible",
    title: "Collapsible",
    sourcePath: "components/bjork-ui/primitives/collapsible.tsx",
    description:
      "A disclosure wrapper for revealing optional details inside the current surface.",
    interactionType: "Disclosure",
    interactionDescription:
      "The user toggles a single hidden content region from an attached trigger.",
    dependencies: ["@radix-ui/react-collapsible"],
  },
  {
    slug: "combobox",
    title: "Combobox",
    sourcePath: "components/bjork-ui/primitives/combobox.tsx",
    description:
      "A searchable picker for choosing one option from a longer list.",
    interactionType: "Searchable selection",
    interactionDescription:
      "The user opens a popover, filters options by typing, and commits one selected value.",
    dependencies: ["React", "cmdk", "@radix-ui/react-popover", "lucide-react", "clsx", "tailwind-merge", "BjorkButton"],
  },
  {
    slug: "command-palette",
    title: "Command Palette",
    sourcePath: "components/bjork-ui/primitives/command-palette.tsx",
    description:
      "A global Command-K search surface for routing across pages, primitives, components, and app actions.",
    interactionType: "Command search",
    interactionDescription:
      "The user opens the palette with a trigger or Command-K, filters results, and commits the selected page or action.",
    dependencies: ["React", "cmdk", "@radix-ui/react-dialog", "next-themes", "next/navigation", "framer-motion", "lucide-react", "clsx", "tailwind-merge"],
  },
  {
    slug: "data-table",
    title: "Data Table",
    sourcePath: "components/bjork-ui/primitives/data-table.tsx",
    description:
      "A filterable table pattern for scanning records and narrowing operational data.",
    interactionType: "Filterable data grid",
    interactionDescription:
      "The user searches records and scans structured rows inside one compact table surface.",
    dependencies: ["lucide-react", "BjorkButton", "BjorkInput", "BjorkTable"],
  },
  {
    slug: "date-picker",
    title: "Date Picker",
    sourcePath: "components/bjork-ui/primitives/date-picker.tsx",
    description:
      "An anchored calendar trigger for selecting a single date without opening a full modal.",
    interactionType: "Popover date selection",
    interactionDescription:
      "The user opens a calendar popover from a button and selects a date in place.",
    dependencies: ["React", "date-fns", "@radix-ui/react-popover", "lucide-react", "clsx", "tailwind-merge", "BjorkButton", "BjorkCalendar"],
  },
  {
    slug: "dialog",
    title: "Dialog",
    sourcePath: "components/bjork-ui/primitives/dialog.tsx",
    description:
      "A centered modal surface for decisions that require the user's focused attention.",
    interactionType: "Modal dialog",
    interactionDescription:
      "The user opens a blocking overlay, completes the focused task, then dismisses or confirms it.",
    dependencies: ["React", "@radix-ui/react-dialog", "lucide-react", "clsx", "tailwind-merge"],
  },
  {
    slug: "dropdown-menu",
    title: "Dropdown Menu",
    sourcePath: "components/bjork-ui/primitives/dropdown-menu.tsx",
    description:
      "A compact action menu for secondary commands tied to a button or row.",
    interactionType: "Context menu",
    interactionDescription:
      "The user opens an anchored menu and chooses one command from the available actions.",
    dependencies: ["React", "@radix-ui/react-dropdown-menu", "lucide-react", "clsx", "tailwind-merge"],
  },
  {
    slug: "form",
    title: "Form",
    sourcePath: "components/bjork-ui/primitives/form.tsx",
    description:
      "A compact form pattern for editing a small set of account or profile fields.",
    interactionType: "Form submission",
    interactionDescription:
      "The user enters values into fields and submits the grouped form action.",
    dependencies: ["lucide-react", "clsx", "tailwind-merge", "BjorkButton", "BjorkInput"],
  },
  {
    slug: "input",
    title: "Input",
    sourcePath: "components/bjork-ui/primitives/input.tsx",
    description:
      "A text-entry field for forms, search shells, filters, and validation states.",
    interactionType: "Text entry",
    interactionDescription:
      "The user focuses the field, types a value, and receives visual feedback for focus, disabled, or invalid states.",
    dependencies: ["React", "framer-motion", "class-variance-authority", "clsx", "tailwind-merge"],
  },
  {
    slug: "input-mask",
    title: "Input Mask",
    sourcePath: "components/bjork-ui/primitives/input-mask.tsx",
    description:
      "A formatted text field for structured numeric values that need grouped spacing.",
    interactionType: "Formatted text entry",
    interactionDescription:
      "The user types into a normal input while the surrounding pattern presents the value as structured data.",
    dependencies: ["React", "lucide-react", "BjorkInput"],
  },
  {
    slug: "input-otp",
    title: "Input OTP",
    sourcePath: "components/bjork-ui/primitives/input-otp.tsx",
    description:
      "A segmented one-time-code input for short verification flows.",
    interactionType: "Verification code entry",
    interactionDescription:
      "The user types or pastes a short code across fixed slots with focus moving through the group.",
    dependencies: ["React", "input-otp"],
  },
  {
    slug: "pagination",
    title: "Pagination",
    sourcePath: "components/bjork-ui/primitives/pagination.tsx",
    description:
      "A page navigation control for moving through long result sets without losing context.",
    interactionType: "Paged navigation",
    interactionDescription:
      "The user moves backward, forward, or directly to a numbered page.",
    dependencies: ["React", "lucide-react", "clsx", "tailwind-merge"],
  },
  {
    slug: "popover",
    title: "Popover",
    sourcePath: "components/bjork-ui/primitives/popover.tsx",
    description:
      "An anchored overlay for short supporting content, filters, or inline controls.",
    interactionType: "Anchored overlay",
    interactionDescription:
      "The user opens a lightweight overlay from a nearby trigger and keeps the page context visible.",
    dependencies: ["React", "@radix-ui/react-popover", "clsx", "tailwind-merge"],
  },
  {
    slug: "radio-group",
    title: "Radio Group",
    sourcePath: "components/bjork-ui/primitives/radio-group.tsx",
    description:
      "A single-choice selector for mutually exclusive options with clear row targets.",
    interactionType: "Single selection",
    interactionDescription:
      "The user chooses exactly one option from a set of labeled rows.",
    dependencies: ["@radix-ui/react-radio-group", "lucide-react"],
  },
  {
    slug: "select",
    title: "Select",
    sourcePath: "components/bjork-ui/primitives/select.tsx",
    description:
      "A compact option picker for short lists where search is unnecessary.",
    interactionType: "Select menu",
    interactionDescription:
      "The user opens a menu and commits one value from a small option set.",
    dependencies: ["@radix-ui/react-select", "lucide-react", "clsx", "tailwind-merge"],
  },
  {
    slug: "sheet",
    title: "Sheet",
    sourcePath: "components/bjork-ui/primitives/sheet.tsx",
    description:
      "A side panel for secondary workflows that should keep the current page visible.",
    interactionType: "Side panel",
    interactionDescription:
      "The user opens a non-page workflow in a side overlay, then saves or dismisses it.",
    dependencies: ["React", "@radix-ui/react-dialog", "lucide-react", "clsx", "tailwind-merge"],
  },
  {
    slug: "slider",
    title: "Slider",
    sourcePath: "components/bjork-ui/primitives/slider.tsx",
    description:
      "A range control for tuning numeric values with immediate visual feedback.",
    interactionType: "Range input",
    interactionDescription:
      "The user drags the thumb or uses keyboard controls to adjust a numeric value between bounds.",
    dependencies: ["React", "next-themes", "clsx", "tailwind-merge"],
  },
  {
    slug: "sonner",
    title: "Sonner",
    sourcePath: "components/bjork-ui/primitives/sonner.tsx",
    description:
      "A toast notification trigger for confirming non-blocking actions.",
    interactionType: "Toast feedback",
    interactionDescription:
      "The user triggers an action and receives a temporary confirmation without leaving the current surface.",
    dependencies: ["React", "sonner", "next-themes", "lucide-react", "BjorkButton"],
  },
  {
    slug: "switch",
    title: "Switch",
    sourcePath: "components/bjork-ui/primitives/switch.tsx",
    description:
      "A binary toggle for persistent on-or-off settings.",
    interactionType: "Toggle switch",
    interactionDescription:
      "The user flips a saved preference between checked and unchecked states.",
    dependencies: ["React", "@radix-ui/react-switch", "clsx", "tailwind-merge"],
  },
  {
    slug: "table",
    title: "Table",
    sourcePath: "components/bjork-ui/primitives/table.tsx",
    description:
      "A structured data surface for comparing rows of account, status, or metric information.",
    interactionType: "Data display",
    interactionDescription:
      "The component presents rows and columns for scanning rather than collecting direct input.",
    dependencies: ["React", "clsx", "tailwind-merge", "BjorkBadge"],
  },
  {
    slug: "tabs",
    title: "Tabs",
    sourcePath: "components/bjork-ui/primitives/tabs.tsx",
    description:
      "A segmented content switcher for parallel views that share one footprint.",
    interactionType: "Tabbed navigation",
    interactionDescription:
      "The user switches between related panels without changing pages.",
    dependencies: ["@radix-ui/react-tabs", "clsx", "tailwind-merge"],
  },
  {
    slug: "textarea",
    title: "Textarea",
    sourcePath: "components/bjork-ui/primitives/textarea.tsx",
    description:
      "A multi-line text field for notes, descriptions, and longer user input.",
    interactionType: "Long-form text entry",
    interactionDescription:
      "The user enters multiple lines of freeform text with the same focus and disabled states as inputs.",
    dependencies: ["React", "clsx", "tailwind-merge"],
  },
  {
    slug: "tooltip",
    title: "Tooltip",
    sourcePath: "components/bjork-ui/primitives/tooltip.tsx",
    description:
      "A hover and focus hint for icon-only controls or compact labels.",
    interactionType: "Hover and focus hint",
    interactionDescription:
      "The user reveals short helper text by hovering or focusing the trigger.",
    dependencies: ["React", "@radix-ui/react-tooltip", "clsx", "tailwind-merge"],
  },
] as const;

export type PrimitiveSlug = (typeof primitiveMeta)[number]["slug"];

export const primitiveSlugs = primitiveMeta.map((item) => item.slug);

export function getPrimitiveMeta(slug: string) {
  return primitiveMeta.find((item) => item.slug === slug);
}
