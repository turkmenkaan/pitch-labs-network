import { startViewingAs } from "../actions";

// Starts a read-only preview as this member (admin only; enforced in the action).
export function ViewAsButton({
  type,
  id,
  children,
  variant = "button",
}: {
  type: "advisor" | "founder";
  id: string;
  children: React.ReactNode;
  variant?: "button" | "link";
}) {
  return (
    <form action={startViewingAs} className="adm-viewas">
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        className={variant === "button" ? "btn btn-ghost btn-sm" : "adm-linkbtn"}
        title={`Preview the ${type} view as ${typeof children === "string" ? children : "this member"}`}
      >
        {variant === "button" ? "View as" : children}
      </button>
    </form>
  );
}
