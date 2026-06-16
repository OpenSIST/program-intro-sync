export function jsonResponse(value: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(value, null, 2), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...init.headers,
    },
  });
}

export function assertAdmin(request: Request, token?: string): Response | null {
  if (!token) {
    return null;
  }
  const auth = request.headers.get("authorization") ?? "";
  if (auth === `Bearer ${token}`) {
    return null;
  }
  return jsonResponse({error: "Unauthorized"}, {status: 401});
}
