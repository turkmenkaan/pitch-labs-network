import { stopViewingAs } from "../admin/actions";
import { PreviewLock } from "./PreviewLock";
import { getPreview } from "@/lib/session";

// Shown on every advisor/founder page while an admin is previewing. The lock
// greys out form controls; the server still refuses every write on its own.
export async function PreviewBanner() {
  const preview = await getPreview();
  if (!preview) return null;
  return (
    <div className="preview-bar" role="status">
      <PreviewLock />
      <span>
        Previewing as <b>{preview.member.name}</b> ({preview.type}) · read-only
      </span>
      <form action={stopViewingAs}>
        <button type="submit" className="preview-exit">
          Exit preview
        </button>
      </form>
    </div>
  );
}
