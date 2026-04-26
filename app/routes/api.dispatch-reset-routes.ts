import { data } from "react-router";
import { resetDispatchRoutesForNewDay } from "../lib/dispatch.server";

function isAuthorized(request: Request) {
  const expected =
    process.env.DISPATCH_RESET_SECRET || process.env.DISPATCH_POLL_SECRET || "";
  if (!expected) return false;

  const url = new URL(request.url);
  const provided =
    request.headers.get("x-dispatch-reset-secret") ||
    request.headers.get("x-dispatch-poll-secret") ||
    url.searchParams.get("secret") ||
    "";

  return provided === expected;
}

export async function loader({ request }: { request: Request }) {
  if (!isAuthorized(request)) {
    return data({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  try {
    await resetDispatchRoutesForNewDay();
    return data({ ok: true, message: "Daily route reset checked." });
  } catch (error) {
    return data(
      {
        ok: false,
        message:
          error instanceof Error ? error.message : "Daily route reset failed.",
      },
      { status: 500 },
    );
  }
}
