"use client";

import { useEffect } from "react";

// Flags <body> so CSS can grey out the page's forms during an admin preview.
export function PreviewLock() {
  useEffect(() => {
    document.body.dataset.preview = "1";
    return () => {
      delete document.body.dataset.preview;
    };
  }, []);
  return null;
}
