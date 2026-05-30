"use client";

import { useEffect, useState } from "react";

export function usePreviewMode() {
  const [isPreview, setIsPreview] = useState(false);

  useEffect(() => {
    setIsPreview(new URLSearchParams(window.location.search).get("preview") === "1");
  }, []);

  return isPreview;
}
