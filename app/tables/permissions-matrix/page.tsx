"use client";

import { useSyncExternalStore } from "react";
import {
  usePreviewMode,
  usePreviewSearchParam,
} from "@/components/bjork-ui/use-preview-mode";
import { SimpleComponentDemoPage } from "@/components/bjork-ui/component-demo-shell";
import {
  PERMISSIONS_MATRIX_SAMPLE,
  PermissionsMatrix,
  type PermissionGrants,
} from "@/components/bjork-ui/tables/permissions-matrix";
import { getGalleryItem } from "@/lib/bjork-gallery";

const item = getGalleryItem("permissions-matrix");

// Preview captures open with three pending edits so the save bar is part of the picture.
const PREVIEW_DRAFT: PermissionGrants = {
  ...PERMISSIONS_MATRIX_SAMPLE,
  "projects.archive": {
    ...PERMISSIONS_MATRIX_SAMPLE["projects.archive"],
    editor: true,
  },
  "members.invite": {
    ...PERMISSIONS_MATRIX_SAMPLE["members.invite"],
    editor: true,
  },
  "billing.invoices": {
    ...PERMISSIONS_MATRIX_SAMPLE["billing.invoices"],
    admin: false,
  },
};

const narrowQuery = "(max-width: 639px)";

function subscribeNarrow(onChange: () => void) {
  const query = window.matchMedia(narrowQuery);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

// On phones the shell would shrink the desktop layout; render at true width so the compact layout shows.
function useNarrowViewport() {
  return useSyncExternalStore(
    subscribeNarrow,
    () => window.matchMedia(narrowQuery).matches,
    () => false,
  );
}

export default function PermissionsMatrixDemo() {
  const isPreview = usePreviewMode();
  const narrow = useNarrowViewport() && !isPreview;
  const previewTheme = usePreviewSearchParam("theme");
  const tableTheme =
    previewTheme === "light" || previewTheme === "dark" ? previewTheme : "auto";

  const handleSave = async (grants: PermissionGrants) => {
    await new Promise((resolve) => setTimeout(resolve, 600));
    console.log("Saved permissions:", grants);
  };

  return (
    <SimpleComponentDemoPage
      item={item}
      description="A roles by permissions matrix for access control. Group rows toggle a whole resource with a tri-state checkbox, owner cells stay locked with a reason, and every edit is counted in a sticky save bar until you save or discard. Arrow keys move across the grid and Space toggles."
      usageCode={`import {
  PermissionsMatrix,
  type PermissionGrants,
  type PermissionGroup,
  type PermissionRole,
} from "@/components/bjork-ui/tables/permissions-matrix";

const roles: PermissionRole[] = [
  { id: "owner", label: "Owner", members: 1, locked: true, lockedReason: "Owners always hold every permission." },
  { id: "editor", label: "Editor", members: 12 },
];

const groups: PermissionGroup[] = [
  { id: "projects", label: "Projects", permissions: [{ id: "projects.delete", label: "Delete projects" }] },
];

<PermissionsMatrix
  roles={roles}
  groups={groups}
  value={savedGrants}
  onSave={(grants: PermissionGrants) => api.updateRoles(grants)}
/>`}
      previewScaleClassName={
        narrow ? "w-[340px] scale-100" : "w-[860px] scale-[0.74]"
      }
      previewCaptureScaleClassName="w-[860px] scale-[0.86]"
      previewInnerClassName="bg-[#f7f5ef] dark:bg-[#111]"
    >
      <div className={narrow ? "w-[calc(100vw-72px)]" : "w-full"}>
        <PermissionsMatrix
          initialDraft={isPreview ? PREVIEW_DRAFT : undefined}
          onSave={handleSave}
          theme={tableTheme}
          enableAnimations={!isPreview}
        />
      </div>
    </SimpleComponentDemoPage>
  );
}
