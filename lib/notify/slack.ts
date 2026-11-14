// Minimal Slack Web API client (bot token). Throws SlackError on failure.
export class SlackError extends Error {
  constructor(
    public code: string,
    public retryAfterMs?: number
  ) {
    super(`Slack: ${code}`);
  }
}

async function call(
  method: string,
  token: string,
  params: Record<string, string>
): Promise<Record<string, unknown>> {
  let res: Response;
  try {
    res = await fetch(`https://slack.com/api/${method}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(params),
      signal: AbortSignal.timeout(8000),
    });
  } catch (e) {
    throw new SlackError(e instanceof Error ? `network_${e.name}` : "network_error");
  }
  if (res.status === 429) {
    const secs = Number(res.headers.get("retry-after")) || 30;
    throw new SlackError("rate_limited", secs * 1000);
  }
  if (!res.ok) throw new SlackError(`http_${res.status}`);
  const body = (await res.json()) as { ok: boolean; error?: string };
  if (!body.ok) throw new SlackError(body.error ?? "unknown_error");
  return body as Record<string, unknown>;
}

export async function lookupUserIdByEmail(token: string, email: string): Promise<string> {
  const body = await call("users.lookupByEmail", token, { email });
  return (body.user as { id: string }).id;
}

// Posting to a user id lands in the bot's direct message with that person.
export async function postDirectMessage(
  token: string,
  slackUserId: string,
  text: string
): Promise<void> {
  await call("chat.postMessage", token, {
    channel: slackUserId,
    text,
    unfurl_links: "false",
  });
}
